# Predicate-Embedded Namespace (PEN) — Layered Binary VM

> **PEN là một ngôn ngữ lập trình nhúng độc lập.**
> Mục tiêu: sinh ra chuỗi base62 nhỏ nhất thế giới mã hóa logic tùy ý.
> Core hoàn toàn không biết về môi trường xung quanh (không biết GUN, không biết time, không biết network).
> Source: [`akaoio/pen`](https://github.com/akaoio/pen) — viết bằng Zig, compile ra `pen.wasm` (26KB, zero imports).

---

## 1. Kiến trúc phân tầng

```
┌─────────────────────────────────────────────────────┐
│  Tầng 2: Application (akao/shop)                    │
│  - Định nghĩa order schema bằng SEA.pen() API       │
│  - Dùng candle number, window, PoW hash             │
│  - Tất cả đều là arithmetic trên registers          │
├─────────────────────────────────────────────────────┤
│  Tầng 1: GUN-PEN Bridge (lib/pen.js)                │
│  - Biết register conventions (R0=key, R1=val...)    │
│  - Inject R4=Date.now() trước khi gọi PEN core      │
│  - Xử lý policy opcodes: SGN, CRT, NOA, POW         │
│  - Biên dịch SEA.pen(spec) → bytecode               │
├─────────────────────────────────────────────────────┤
│  Tầng 0: PEN Core (lib/pen.wasm) — STANDALONE       │
│  - Nguồn: akaoio/pen (Zig), compile ra WASM 26KB    │
│  - Nhận: (bytecode, registers[])                    │
│  - Trả về: boolean                                  │
│  - Không biết GUN, time, hay bất kỳ môi trường nào  │
│  - JS bridge + compiler: lib/pen.js                 │
│  - Copy pen.wasm vào lib/: npm run buildPEN         │
└─────────────────────────────────────────────────────┘
```

**PEN Core** (`lib/pen.wasm`) là freestanding WASM binary, viết bằng Zig tại [`akaoio/pen`](https://github.com/akaoio/pen). Không có JS fallback — không cần thiết. Các tầng trên là glue code JavaScript.

---

## 2. Encoding: Bytecode → Base62 (tối ưu lý thuyết)

Cách compact nhất để encode N bytes thành base62:

```
1. Prepend sentinel byte 0x01  (xử lý leading-zero bytes)
2. Interpret buffer như big-endian unsigned integer
3. Convert sang variable-length base62 (không padding)
→ ceil((N+1)×8 / log₂62) chars — lower bound lý thuyết
```

So sánh với chunked approach (bufToB62 cũ):
- bufToB62: 32-byte chunk → fixed 44 chars (waste khi không phải bội số 32)
- BigInt approach: 10 bytes → 15 chars, 20 bytes → 29 chars, 70 bytes → ~94 chars

### 2.1 `pen.pack` / `pen.unpack` trong `lib/pen.js`

```js
function b62enc(n) {
    if (n === 0n) return ALPHA[0];
    var s = '';
    while (n > 0n) { s = ALPHA[Number(n % 62n)] + s; n = n / 62n; }
    return s;
}
function b62dec(s) {
    var n = 0n;
    for (var i = 0; i < s.length; i++) n = n * 62n + BigInt(ALPHA_MAP[s[i]] || 0);
    return n;
}

// Buffer ↔ base62 (sentinel 0x01 để tránh mất leading zero bytes)
function penpack(buf) {
    var hex = '01';
    for (var i = 0; i < buf.length; i++) hex += ('0' + buf[i].toString(16)).slice(-2);
    return b62enc(BigInt('0x' + hex));
}
function penunpack(s) {
    var n = b62dec(s);
    var hex = n.toString(16);
    if (hex.length % 2) hex = '0' + hex;
    var bytes = [];
    for (var i = 0; i < hex.length; i += 2) bytes.push(parseInt(hex.slice(i, i+2), 16));
    return shim.Buffer.from(bytes.slice(1)); // bỏ sentinel 0x01
}
// Export: module.exports = pen  (pen.pack / pen.unpack)
```

---

## 3. PEN Core ISA v1 — Environment-Agnostic

### 3.1 Nguyên tắc thiết kế

- **Expression tree encoding**: mỗi opcode là node trong cây, theo sau là các sub-expression (arguments). Không có explicit stack management.
- **Đệ quy xuôi**: đọc bytecode từ trái sang phải, depth-first.
- **Kiểu dữ liệu**: null, bool, integer (64-bit), float (64-bit), string.
- **Register**: indexed 0–127 = host-provided; 128–255 = local slots (dùng với LET).
- **Output**: boolean — PEN là predicate language.

### 3.2 Bytecode stream

```
[u8 version=0x01] [root_expr]
```

### 3.3 Constants

| Opcode | Encoding | Giá trị |
|--------|----------|---------|
| `0x00` | `0x00` | null |
| `0x01` | `0x01` | true |
| `0x02` | `0x02` | false |
| `0x03` | `0x03 [u8 len][utf8...]` | string (max 255 bytes) |
| `0x04` | `0x04 [uleb128]` | unsigned integer (ULEB128 variable-length) |
| `0x07` | `0x07 [sleb128]` | signed integer (SLEB128, dùng khi âm) |
| `0x08` | `0x08 [f64be]` | float64 (IEEE 754) |

> **Varint encoding (ULEB128):** mỗi byte đóng góp 7 bit, bit cao = 1 nếu còn byte tiếp theo.
> - 0–127: **1 byte** (tiết kiệm 1 byte so với uint8 cũ).
> - 300000: **3 bytes** `[0xE0, 0xA7, 0x12]` thay vì 5 bytes (uint32). Tiết kiệm 2 bytes.
> Không còn `0x05` (uint16) và `0x06` (uint32) — varint thay thế hoàn toàn.

### 3.4 Register

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x10` | `0x10 [u8 n]` | REG(n) — load register n vào evaluation |

Host registers R[0..127] là strings hoặc numbers tùy host cung cấp.
Local registers R[128..255] được set bởi LET opcode.

### 3.5 Logic (n-ary, short-circuit)

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x20` | `0x20 [u8 n] [expr × n]` | AND — tất cả n sub-expr phải true |
| `0x21` | `0x21 [u8 n] [expr × n]` | OR — ít nhất 1 |
| `0x22` | `0x22 [expr]` | NOT |
| `0x23` | `0x23` | PASS — always true |
| `0x24` | `0x24` | FAIL — always false |

### 3.6 Comparison

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x30` | `0x30 [expr][expr]` | EQ — equal (string hoặc number) |
| `0x31` | `0x31 [expr][expr]` | NE — not equal |
| `0x32` | `0x32 [expr][expr]` | LT — less than |
| `0x33` | `0x33 [expr][expr]` | GT — greater than |
| `0x34` | `0x34 [expr][expr]` | LTE — less than or equal |
| `0x35` | `0x35 [expr][expr]` | GTE — greater than or equal |

Comparison với string là so sánh từ điển (lexicographic). Comparison với number là arithmetic.

### 3.7 Arithmetic

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x40` | `0x40 [expr][expr]` | ADD |
| `0x41` | `0x41 [expr][expr]` | SUB |
| `0x42` | `0x42 [expr][expr]` | MUL |
| `0x43` | `0x43 [expr][expr]` | DIVU — integer floor division (a/b, floor) |
| `0x44` | `0x44 [expr][expr]` | MOD — remainder (a % b) |
| `0x45` | `0x45 [expr][expr]` | DIVF — float division |
| `0x46` | `0x46 [expr]` | ABS |
| `0x47` | `0x47 [expr]` | NEG |

> **Candle number** là phép toán thuần túy: `DIVU(R[4], INT32(size_ms))`.
> Candle R[4] là `Date.now()` do host inject vào là host-level concern, không phải PEN-level.

### 3.8 String operations

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x50` | `0x50 [expr]` | LEN — string length → number |
| `0x51` | `0x51 [expr][expr][expr]` | SLICE(str, start, end) → string |
| `0x52` | `0x52 [expr][u8 sep][expr_idx]` | SEG(str, sep_char, idx) → segment string |
| `0x53` | `0x53 [expr]` | TONUM(str) → number (parseFloat) |
| `0x54` | `0x54 [expr]` | TOSTR(num) → string |
| `0x55` | `0x55 [expr][expr]` | CONCAT(a, b) → string |
| `0x56` | `0x56 [expr][expr]` | PRE(str, prefix) → bool (startsWith) |
| `0x57` | `0x57 [expr][expr]` | SUF(str, suffix) → bool (endsWith) |
| `0x58` | `0x58 [expr][expr]` | INCLUDES(str, needle) → bool |
| `0x59` | `0x59 [expr][expr]` | REGEX(str, pattern) → bool |
| `0x5A` | `0x5A [expr]` | UPPER(str) → string |
| `0x5B` | `0x5B [expr]` | LOWER(str) → string |

> **SEG note:** `sep` là raw byte (1 char separator). Separator `'_'` = 0x5F. Tiết kiệm 3-4 bytes so với encode
> separator như full string constant.

### 3.9 Type checks

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x60` | `0x60 [expr]` | ISS — is string |
| `0x61` | `0x61 [expr]` | ISN — is number (finite) |
| `0x62` | `0x62 [expr]` | ISX — is null |
| `0x63` | `0x63 [expr]` | ISB — is boolean |
| `0x64` | `0x64 [expr][u8 min][u8 max]` | LNG — string length in [min, max] |

### 3.10 Local binding (LET)

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x70` | `0x70 [u8 n][expr_def][expr_body]` | LET(n, def, body) — eval def, store in R[128+n], eval body |

`LET` dùng để tránh tính toán lặp lại. Ví dụ: tính current candle một lần, dùng lại 2 lần trong body.

```
LET(0, DIVU(R[4], INT32(300000)),    ← local R[128] = current candle
  AND(2,
    GTE(R[128], SUB(TONUM(SEG(R[0],'_',0)), INT8(100))),
    LTE(R[128], ADD(TONUM(SEG(R[0],'_',0)), INT8(2)))
  )
)
```

Wait — đúng ra GTE(candle_in_key, current - 100) và LTE(candle_in_key, current + 2):

```
LET(0, DIVU(R[4], INT32(300000)),    ← current candle
  LET(1, TONUM(SEG(R[0], '_', 0)),  ← candle number from key
    AND(2,
      GTE(R[129], SUB(R[128], INT8(100))),
      LTE(R[129], ADD(R[128], INT8(2)))
    )
  )
)
```

### 3.11 Conditional

| Opcode | Encoding | Ý nghĩa |
|--------|----------|---------|
| `0x71` | `0x71 [cond][then][else]` | IF(cond, then, else) → value |

### 3.12 Reserved ranges

| Range | Dùng cho |
|-------|---------|
| `0x00–0x7F` | PEN Core v1 (defined above) |
| `0x80–0x81` | SEGR / SEGRN macros (v1 optimization, xem §3.13) |
| `0x82–0xBF` | PEN Core v2+ extensions |
| `0xC0–0xDF` | Host extension opcodes (e.g., PoW hash, gun policy) |
| `0xE0–0xEF` | Inline integer shortcuts: `0xE0` = 0, `0xE1` = 1 ... `0xEF` = 15 (optimization) |
| `0xF0–0xFF` | Register shorthands (v1 optimization, xem §3.13) |

> **Host extension opcodes** (0xC0..): cho phép host thêm opcode đặc thù. Ví dụ GUN layer thêm `0xC0` = SGN,
> `0xC1` = CRT. PEN core throw "unknown opcode" nếu gặp — host callback xử lý extension.

### 3.13 Optimization opcodes (v1)

Ba tối ưu hóa được bổ sung vào ISA v1 để giảm kích thước bytecode mà không thay đổi ngữ nghĩa hay phức tạp hóa VM:

#### Varint integers (`0x04`, `0x07`)

Thay thế fixed-width types (uint8/uint16/uint32/int32) bằng variable-length encoding:

| Giá trị | Fixed (cũ) | Varint (mới) | Tiết kiệm |
|---------|-----------|-------------|----------|
| 0–127 | `0x04 [1B]` = 2 bytes | `0x04 [1B]` = 2 bytes | 0 |
| 300000 | `0x06 [4B]` = 5 bytes | `0x04 [3B]` = 4 bytes | **1 byte** |
| âm số | `0x07 [4B]` = 5 bytes | `0x07 [1–2B]` | **2–3 bytes** |

```
ULEB128(300000):
  byte 1: (300000 & 0x7F) | 0x80 = 0xE0  ← còn tiếp
  byte 2: (300000 >> 7 & 0x7F) | 0x80 = 0xA7  ← còn tiếp
  byte 3: (300000 >> 14) = 0x12  ← kết thúc
  → [0xE0, 0xA7, 0x12]  (3 bytes thay vì 4)
```

#### Register shorthands (`0xF0–0xFF`)

Mỗi `REG(n)` = `0x10 [u8]` = 2 bytes. Shorthand = **1 byte**. Thông thường 8–12 register refs mỗi bytecode → tiết kiệm 8–12 bytes.

| Opcode | Tương đương | Giá trị |
|--------|------------|---------|
| `0xF0` | `REG(0)` | key |
| `0xF1` | `REG(1)` | val |
| `0xF2` | `REG(2)` | soul |
| `0xF3` | `REG(3)` | state |
| `0xF4` | `REG(4)` | now |
| `0xF5` | `REG(5)` | pub |
| `0xF8` | `REG(128)` | local[0] |
| `0xF9` | `REG(129)` | local[1] |
| `0xFA` | `REG(130)` | local[2] |
| `0xFB` | `REG(131)` | local[3] |

#### SEGR macros (`0x80–0x81`)

Pattern `SEG(REG[r], sep, idx)` và `TONUM(SEG(...))` xuất hiện 3–5 lần mỗi bytecode. Macro hóa thành 4-byte inline instruction:

| Opcode | Encoding | Tương đương | Từ → Đến |
|--------|----------|------------|----------|
| `0x80` | `0x80 [u8 reg][u8 sep][u8 idx]` | `SEG(REG[reg], sep, idx)` | 6 → 4 bytes |
| `0x81` | `0x81 [u8 reg][u8 sep][u8 idx]` | `TONUM(SEG(REG[reg], sep, idx))` | 7 → 4 bytes |

`sep` là raw ascii byte (ví dụ `'_'` = `0x5F`). `idx` là u8 (0–255).

#### Tác động tổng hợp (ví dụ order bytecode)

| Tối ưu | Tiết kiệm |
|--------|-----------|
| Varint (300000: 5→4 bytes) | ~1 byte |
| Register shorthands (~10 refs) | ~10 bytes |
| SEGR macros (3 uses: 6+7+6 → 4+4+4) | ~7 bytes |
| **Tổng** | **~18 bytes** |
| **Kết quả** | **75 → ~57 bytes → ~77 base62 chars** (giảm ~23%) |

---

## 4. GUN-PEN Bridge (Tầng 1) — `lib/pen.js`

### 4.1 Register conventions

| Register | Giá trị | Kiểu |
|----------|---------|------|
| R[0] | write key | string |
| R[1] | write val (raw JSON string) | string |
| R[2] | soul | string |
| R[3] | HAM state timestamp (ms) | number |
| R[4] | Date.now() — inject bởi GUN layer | number |
| R[5] | writer pub từ authenticated user hoặc `opt.authenticator.pub` | string |

R[4] là `Date.now()` — host inject mỗi lần validate. PEN bytecode tự tính candle number từ R[4] bằng DIVU.

### 4.2 Host extension opcodes (policy)

| Opcode | Mnemonic | Ý nghĩa |
|--------|----------|---------|
| `0xC0` | SGN | Require valid SEA signature |
| `0xC1` | CRT `[u8 len][utf8 pub...]` | Require cert from pub (max 255 bytes) |
| `0xC3` | NOA | No auth required (explicit open) |
| `0xC4` | POW `[u8 reg][u8 difficulty]` | PoW: SHA256(R[reg]).hex starts with `difficulty` zeros (async) |
| `0xC5` | PAR `[uleb len][utf8 json...]` | Compile-time canonical params that change soul identity only |

Tail bytes được **append vào SAU expression root** trong bytecode — WASM VM dừng đọc sau node gốc nên không thấy chúng. `pen.scanpolicy(bytecode)` dùng `treeskip()` để tìm điểm kết thúc chính xác của expression tree, rồi quét bytes phía sau. Cách này tránh false positive khi byte value `0xC0`–`0xC5` xuất hiện bên trong integer/string constants.

Luồng thực thi trong `penStage`:
1. `pen.unpack(soul.slice(1))` → bytecode
2. `pen.scanpolicy(bytecode)` → `{ sign, cert, open, pow, params }` (tail bytes sau tree root)
3. `pen.run(bytecode, regs)` → boolean (predicate)
4. Nếu `policy.pow`: async `SEA.work(R[pow.field])`, kiểm tra hex prefix
5. `applypolicy(policy, ctx, reject)` → forward hoặc verify signature

### 4.3 `SEA.pen(spec)` — high-level compiler

Input spec format:

```js
SEA.pen({
    // Field predicates (tùy chọn)
    key:   <expr>,    // validate write key (R[0])
    val:   <expr>,    // validate write value (R[1])
    soul:  <expr>,    // validate soul (R[2])
    state: <expr>,    // validate HAM state (R[3])
    path:  <expr>,    // validate path after $bytecode/ (R[6])

    // Policy (GUN-layer extension opcodes — append sau expression root)
    sign: true,                         // 0xC0 = SGN
    cert: "<pubchars>",                 // 0xC1 = CRT(pub)
    open: true,                         // 0xC3 = NOA
    pow: { field: 1, difficulty: 3 },   // 0xC4 = POW(R[field], difficulty)

    // Compile-time identity salt (không đổi semantics validator)
    params: <json-serializable>         // 0xC5 = canonical JSON payload
})
// returns: '$<base62>' soul string
```

`<expr>` là:
```js
"string"                     // shorthand EQ(field, string)
{ eq: "x" }                  // EQ string
{ eq: [<expr>, <expr>] }     // EQ dynamic
{ ne: "x" }                  // NE
{ ne: [<expr>, <expr>] }     // NE dynamic
{ pre: "x" }                 // PRE (startsWith)
{ suf: "x" }                 // SUF (endsWith)
{ inc: "x" }                 // INCLUDES
{ lt: 100 }, { gt: 100 }, { lte: 100 }, { gte: 100 }  // numeric compare (constant on right)
{ lt: [<expr>, <expr>] }     // numeric compare, cả hai vế là expressions
{ and: [<expr>...] }         // AND
{ or:  [<expr>...] }         // OR
{ not: <expr> }              // NOT
{ type: "string" | "number" | "null" | "bool" }   // type check
{ length: [min, max] }       // LNG
{ seg: { sep: "_", idx: 0, of: <expr>, match: <expr> } }  // SEG
{ let: { bind: 0, def: <expr>, body: <expr> } } // LET
{ if: { cond: <expr>, then: <expr>, else: <expr> } } // IF
{ reg: 128 }                 // REG(n) — local[0]=128, local[1]=129...
{ divu: [<expr>, <expr>] }   // DIVU — integer floor division
{ mod: [<expr>, <expr>] }    // MOD
{ add: [<expr>, <expr>] }    // ADD
{ sub: [<expr>, <expr>] }    // SUB
{ mul: [<expr>, <expr>] }    // MUL
{ tonum: <expr> }            // TONUM — string to number
{ tostr: <expr> }            // TOSTR — number to string
```

### 4.4 `params` — compile-time soul parameters

`params` là payload JSON-serializable được **canonicalize** rồi append vào tail bytecode. Nó:

- **làm soul string khác nhau** khi params khác nhau
- **không đổi validator semantics** của `key/val/soul/state/path`
- **không phải runtime register mới**

Dùng khi bạn cần nhiều soul có cùng validator logic nhưng identity khác nhau theo compile-time inputs:

```js
var a = SEA.pen({
  key: { type: 'string' },
  params: { item: 'organic-green-tea', type: 'buy', candle: 5820000 }
});

var b = SEA.pen({
  key: { type: 'string' },
  params: { item: 'organic-green-tea', type: 'buy', candle: 5820001 }
});

// a !== b  (khác soul vì params khác)
```

> Nếu hai object có cùng nội dung nhưng khác thứ tự key, soul vẫn giống nhau vì params được canonicalize trước khi encode.

### 4.5 Helper: `SEA.candle(opts)` — temporal shorthand (Tầng 1)

Candle number = `Math.floor(timestamp_ms / size_ms)`.
Đây là helper ở Tầng 1, compile xuống expression thuần túy rồi truyền vào `SEA.pen()`.

```js
// Helper: validate rằng key segment idx chứa valid candle number trong window
SEA.candle = function(opts) {
    // opts: { seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 }
    // Tất cả fields có default: sep="_", size=300000, back=100, fwd=2
    // Compile ra PEN expr:
    // LET(0, DIVU(R[4], size),           ← current candle = floor(now/size)
    //   LET(1, TONUM(SEG(R[0], sep, idx)), ← candle_num from key segment
    //     AND(2,
    //       GTE(R[129], SUB(R[128], back)),
    //       LTE(R[129], ADD(R[128], fwd))
    //     )
    //   )
    // )
    return {
        let: {
            bind: 0,
            def: { divu: [{ reg: 4 }, opts.size] },    // current candle
            body: {
                let: {
                    bind: 1,
                    def: { tonum: { seg: { sep: opts.sep, idx: opts.seg, of: { reg: 0 } } } },
                    body: {
                        and: [
                            { gte: [{ reg: 129 }, { sub: [{ reg: 128 }, opts.back] }] },
                            { lte: [{ reg: 129 }, { add: [{ reg: 128 }, opts.fwd] }] }
                        ]
                    }
                }
            }
        }
    }
}
```

Caller dùng:
```js
SEA.pen({
    key: { and: [
        SEA.candle({ seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 }),
        { seg: { sep: "_", idx: 3, of: { reg: 0 }, match: { or: [{ eq: "buy" }, { eq: "sell" }] } } }
    ]},
    sign: true
})
```

`candle` không phải opcode. Nó là sugar reduce xuống LET + DIVU + GTE + LTE + SEG + TONUM.

### 4.6 `SEA.pen({ pow })` — Proof of Work option

PoW verification là: `SHA256(val).startsWith("000...difficulty_zeros")`

Cách implement trong PEN: host extension opcode `0xC4` = POW — vì SHA256 là async, không thể model trong sync expression tree. Pipeline stage xử lý async trước khi gọi check.next.

```js
// Policy-level (async, handled by GUN layer)
SEA.pen({ pow: { field: 1, difficulty: 3 } })
// pow.field là register index: 0=key, 1=val, 2=soul, 4=now, 5=pub
// → bytecode: 0xC4 [u8 field_reg] [u8 difficulty]  (appended after expression root)
// → penStage: async SEA.work(R[field]) → verify hex prefix "000..."
```

---

## 5. `lib/pen.js` — cấu trúc thực tế

`lib/pen.js` là một file duy nhất chứa toàn bộ PEN stack cho GUN: WASM loader, pack/unpack encoding, bytecode builder (bc), treeskip/scanpolicy, penStage pipeline, và compiler (`SEA.pen` / `SEA.candle`).

> **Không phải standalone.** `lib/pen.js` require GUN + SEA để đăng ký vào pipeline.
> PEN Core thuần túy là `lib/pen.wasm` — không import gì, không phụ thuộc vào JS runtime.

### 5.1 API công khai

```js
var pen = require('./lib/pen');  // sau khi require('./sea')

// pen.ready — Promise resolve khi WASM load xong
await pen.ready;

// pen.run(bytecode, regs) — chạy bytecode trên pen.wasm
// bytecode: Uint8Array,  regs: Array (R[0..127] = host-provided values)
// returns: boolean
var ok = pen.run(bytecode, ['mykey', 'value', soul, 0, Date.now(), '']);

// pen.pack(uint8array) → base62 string  (sentinel 0x01 + BigInt encode)
// pen.unpack(base62str) → Uint8Array
var encoded = pen.pack(bytecode);
var decoded = pen.unpack(encoded);

// pen.bc — bytecode builder
var bc = pen.bc;
var bytecode = bc.prog(bc.iss(bc.r1()));   // [0x01, 0x60, 0xF1]

// pen.scanpolicy(bytecode) → { sign, cert, open, pow, params }
// Dùng treeskip() để tìm đúng điểm kết thúc expression tree,
// rồi chỉ quét bytes PHÍA SAU tree — tránh false positive.
var policy = pen.scanpolicy(bytecode);
```

### 5.2 SEA API

```js
// SEA.pen(spec) → '$<base62>' soul string
var soul = SEA.pen({ key: { pre: 'order_' }, val: { type: 'string' }, sign: true });

// SEA.candle(opts) → expr (dùng trong spec.key hoặc spec.val)
var expr = SEA.candle({ seg: 0, sep: '_', size: 300000, back: 100, fwd: 2 });

// params đổi soul identity mà không đổi validator semantics
var market = SEA.pen({ key: { type: 'string' }, params: { item: 'tea', type: 'buy', candle: 5820000 } });
```

### 5.3 Bytecode builder reference (pen.bc)

```js
// Constants
bc.prog(root)      // [0x01, ...root]  — version + root expr
bc.null_()         // [0x00]
bc.true_()         // [0x01]
bc.false_()        // [0x02]
bc.str(s)          // [0x03, len, ...utf8]
bc.uint(n)         // [0x04, ...uleb128]
bc.int(n)          // [0x07, ...sleb128]
bc.f64(n)          // [0x08, ...8 bytes f64]
bc.pass()          // [0x23]
bc.fail()          // [0x24]

// Registers (shorthands for R[0]–R[5] and local[0]–local[3])
bc.r0()–bc.r5()    // [0xF0]–[0xF5]  (R[0]=key, R[1]=val, R[2]=soul, R[3]=state, R[4]=now, R[5]=pub)
bc.local(n)        // [0xF8+n]        (LET local slots)
bc.reg(n)          // [0x10, n]       (generic)
bc.intn(n)         // [0xE0+n] if 0≤n≤15, else bc.uint(n)

// Logic
bc.and(exprs)      // [0x20, n, ...exprs]
bc.or(exprs)       // [0x21, n, ...exprs]
bc.not(a)          // [0x22, ...a]

// Comparison (EQ, NE, LT, GT, LTE, GTE)
bc.eq(a,b) … bc.gte(a,b)

// Arithmetic (ADD, SUB, MUL, DIVU, MOD, ABS, NEG)
bc.add(a,b) … bc.neg(a)

// String
bc.len(a)  bc.slice(a,s,e)  bc.seg(a,sep,idx)
bc.tonum(a)  bc.tostr(a)  bc.concat(a,b)
bc.pre(a,b)  bc.suf(a,b)  bc.inc(a,b)
bc.upper(a)  bc.lower(a)

// Type checks
bc.iss(a)  bc.isn(a)  bc.isx(a)  bc.isb(a)
bc.lng(a,min,max)   // LNG: string length in [min, max]

// Control
bc.let_(slot, def, body)   // [0x70, slot, ...def, ...body]
bc.if_(cond, then, else_)  // [0x71, ...cond, ...then, ...else]

// SEGR macros (4-byte inline optimization)
bc.segr(reg, sep, idx)     // [0x80, reg, sep_byte, idx]  = SEG(REG[reg], sep, idx)
bc.segrn(reg, sep, idx)    // [0x81, reg, sep_byte, idx]  = TONUM(SEG(REG[reg], sep, idx))
```

### 5.4 Giới hạn an toàn

- Max bytecode: **512 bytes** (penStage reject trước khi chạy WASM)
- Max string constant: **255 bytes** (opcode `0x03 [u8 len]`)
- Version byte: phải là `0x01`

---

## 6. Tích hợp với GUN pipeline

### 6.1 Cơ chế đăng ký

`lib/pen.js` tự đăng ký vào `SEA.check` pipeline khi được `require`:

```js
// Tại cuối lib/pen.js — chạy ngay khi module load:
if (SEA.check && SEA.check.use) {
  SEA.check.use(function(ctx, pipeline) {
    if (!ctx.soul || ctx.soul[0] !== '$') return;
    pipeline.splice(1, 0, penStage);  // insert trước các stage khác
  });
}
```

Để kích hoạt, `require('./lib/pen')` sau khi `require('./sea')`.

### 6.2 `penStage` — pipeline stage

```js
function penStage(ctx, next, reject) {
  var soul = ctx.soul;

  // 1. Decode + validate bytecode
  var bytecode = pen.unpack(soul.slice(1));
  if (!bytecode || bytecode.length < 2) return reject('PEN: empty bytecode');
  if (bytecode.length > 512)            return reject('PEN: bytecode too large');

  // 2. Extract policy (bytes AFTER expression root, via treeskip)
  var policy = pen.scanpolicy(bytecode);

  // 3. Build registers
  // R[0]=key  R[1]=val (raw)  R[2]=soul  R[3]=state  R[4]=now  R[5]=writer pub
  // R[5] ưu tiên sec.upub, fallback sang sec.authenticator.pub để shared PEN souls
  var regs = [
    ctx.key, ctx.val, soul,
    ctx.state || 0, Date.now(),
    (ctx.at && ctx.at.user && ctx.at.user.is && ctx.at.user.is.pub) || ''
  ];

  // 4. Run predicate on WASM (synchronous)
  pen.ready.then(function() {
    var ok = pen.run(bytecode, regs);
    if (!ok) return reject('PEN: predicate failed');

    // 5. Enforce policy (async for PoW)
    if (policy.pow) {
      SEA.work(regs[policy.pow.field], null, function(hash) {
        var prefix = new Array(policy.pow.difficulty + 1).join('0');
        if ((hash || '').indexOf(prefix) !== 0) return reject('PEN: PoW insufficient');
        applypolicy(policy, ctx, reject);
      }, { name: 'SHA-256', encode: 'hex' });
      return;
    }
    applypolicy(policy, ctx, reject);
  });
}
```

### 6.3 `applypolicy` — xử lý sau khi predicate qua

| Policy | Hành động |
|--------|-----------|
| `cert` | `SEA.check.$vfy(...)` — verify cert signature |
| `sign` | `SEA.check.auth(...)` nếu có authenticator; hoặc verify existing signature |
| `open` / không có policy | `eve.to.next(msg)` — forward trực tiếp |
| `pow` | Handled async trong penStage trước khi gọi applypolicy |

---

## 7. Ví dụ: Order Namespace với Temporal Candle

### 7.1 Key format (dùng candle NUMBER, không phải timestamp)

```
<candle_num>_<tokenA>_<tokenB>_<direction>_<nonce>
```

Ví dụ với 5-phút candle:
- `Math.floor(Date.now() / 300000) = 5820000` (7 chữ số)
- Key: `"5820000_ETH_USDT_buy_a3f7b2"`

**So với raw timestamp (13 chữ số):** tiết kiệm 6 chars trong mỗi key, giúp phần prefix LEX range query ngắn hơn.

### 7.2 Schema definition

```js
var orderSoul = SEA.pen({
    key: { and: [
        SEA.candle({ seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 }),
        { seg: { sep: "_", idx: 3, of: { reg: 0 },
                 match: { or: [{ eq: "buy" }, { eq: "sell" }] } } }
    ]},
    sign: true
})
// → "$abc..." (~77 base62 chars)
```

### 7.3 Bytecode trace (compact)

```
version: 0x01                                              (1 byte)
AND(2)                                                     (2 bytes)
  LET(0, DIVU(0xF4, UINT(300000)),    // 0xF4=R[4], varint  [7 bytes, was 9]
    LET(1, SEGRN(0, '_', 0),          // 0x81 macro          [4 bytes, was 8]
      AND(2,
        GTE(0xF9, SUB(0xF8, UINT(100))), // 0xF9=R[129]       [6 bytes, was 11]
        LTE(0xF9, ADD(0xF8, UINT(2)))    // 0xF8=R[128]       [5 bytes, was 10]
      )
    )
  )
  OR(2,
    EQ(SEGR(0, '_', 3), STR("buy")),  // 0x80 macro          [7 bytes, was 10]
    EQ(SEGR(0, '_', 3), STR("sell"))  //                     [8 bytes, was 11]
  )
0xC0  (SGN policy)                                         (1 byte)

Total: ~57 bytes → penpack → ~77 base62 chars  (was ~75 bytes → ~100 chars, -23%)
```

### 7.4 Discovery (không thay đổi — dùng LEX query của GUN)

```js
// Tất cả ETH/USDT buy orders trong nến hiện tại
var candle = Math.floor(Date.now() / 300000)
gun.get(orderSoul).get({ '>': candle + '_ETH_USDT_buy', '<': candle + '_ETH_USDT_buy~' })
    .once(function(orders) { /* ... */ })
```

---

## 8. Trạng thái triển khai

| # | File | Nội dung | Trạng thái |
|---|------|---------|------------|
| 1 | `lib/pen.js` | WASM loader (`pen.ready`/`pen.run`/`pen.bc`) + compiler (`pen.pack`/`pen.unpack`) | ✅ |
| 2 | `lib/pen.js` | `pen.scanpolicy` (treeskip-based) + `penStage` + `applypolicy` | ✅ |
| 3 | `sea/index.js` | `SEA.check.use(penStage)`, routing `'$' === soul[0]` | ✅ |
| 4 | `sea.js` | Rebuild: `npm run buildSEA` | ✅ |
| 5 | `test/pen.js` | 52 tests: ISA, LET, candle, policy, adversarial | ✅ |

> `lib/pen.js` là file **độc lập hoàn toàn** — WASM loader + compiler + penStage trong 1 file.
> `lib/pen.wasm` (26KB, Zig-compiled) chứa core VM — không biết GUN, time, hay network.

---

## 9. Roadmap

```
akaoio/gun (hiện tại)
  lib/pen.js          ← WASM loader + compiler + penStage (1 file)
  lib/pen.wasm        ← Zig-compiled WASM, 26KB, zero GUN imports
  sea/index.js        ← integration (SEA.check.use(penStage))

akaoio/pen (tương lai, planned)
  pen.wasm            ← same WASM
  pen.zig             ← Zig source (same ISA)
  compiler.js         ← high-level spec → bytecode
  README.md

akao/shop (application)
  Dùng SEA.pen() API  ← order/dispute/trade namespaces
```

Zig port: ISA v1 là fixed spec — không thay đổi opcode meanings sau khi publish. Version byte (`0x01`) cho phép thêm ISA v2 sau này.
