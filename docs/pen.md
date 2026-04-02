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
│  - Định nghĩa order schema bằng sea.pen() API       │
│  - Dùng candle number, window, PoW hash             │
│  - Tất cả đều là arithmetic trên registers          │
├─────────────────────────────────────────────────────┤
│  Tầng 1: GUN-PEN Bridge (sea/pen.js)                │
│  - Biết register conventions (R0=key, R1=val...)    │
│  - Inject R4=Date.now() trước khi gọi PEN core      │
│  - Xử lý policy opcodes: SGN, CRT, OWN, NOA         │
│  - Biên dịch sea.pen(spec) → bytecode               │
├─────────────────────────────────────────────────────┤
│  Tầng 0: PEN Core (lib/pen.wasm) — STANDALONE      │
│  - Nguồn: akaoio/pen (Zig), compile ra WASM 26KB   │
│  - Nhận: (bytecode, registers[])                    │
│  - Trả về: boolean / number / string                │
│  - Không biết GUN, time, hay bất kỳ môi trường nào │
│  - JS wrapper: node_modules/@akaoio/pen/pen.js      │
│  - Copy vào lib/: npm run buildPEN                  │
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

### 2.1 `penpack` / `penunpack` trong `sea/base62.js`

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
// Export: var b62 = { ..., penpack, penunpack }
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

## 4. GUN-PEN Bridge (Tầng 1) — `sea/pen.js`

### 4.1 Register conventions

| Register | Giá trị | Kiểu |
|----------|---------|------|
| R[0] | write key | string |
| R[1] | write val (raw JSON string) | string |
| R[2] | soul | string |
| R[3] | HAM state timestamp (ms) | number |
| R[4] | Date.now() — inject bởi GUN layer | number |
| R[5] | writer pub (nếu có) | string |

R[4] là `Date.now()` — host inject mỗi lần validate. PEN bytecode tự tính candle number từ R[4] bằng DIVU.

### 4.2 Host extension opcodes (policy)

| Opcode | Mnemonic | Ý nghĩa |
|--------|----------|---------|
| `0xC0` | SGN | Require valid SEA signature |
| `0xC1` | CRT `[u8 len][utf8 pub88]` | Require cert from pub |
| `0xC2` | OWN | Writer pub must === specified owner |
| `0xC3` | NOA | No auth required (explicit open) |

Policy opcodes không return false — chúng set side-effects vào `policy` object. VM phân tầng: PEN core không biết về chúng (throw unknown opcode), GUN bridge intercept trước khi gọi core.

Chia thành 2 pass:
1. **Policy scan pass** — đọc tuyến tính bytecode, extract các `0xC0..0xC3` opcodes vào `policy` object
2. **PEN core pass** — chạy phần còn lại (predicate) qua PEN core pure VM

### 4.3 `sea.pen(spec)` — high-level compiler

Input spec format:

```js
sea.pen({
    // Field predicates (tùy chọn)
    key:   <expr>,    // validate write key (R[0])
    val:   <expr>,    // validate write value (R[1])
    soul:  <expr>,    // validate soul (R[2])
    state: <expr>,    // validate HAM state (R[3])

    // Temporal — defined in terms of generic arithmetic, NOT special opcodes
    // Caller tự xây bằng { and: [...] } nếu cần, hoặc dùng helper bên dưới

    // Policy (GUN-layer extension opcodes)
    sign: true,              // 0xC0 = SGN
    cert: "<pub88chars>",    // 0xC1 = CRT(pub)
    open: true,              // 0xC3 = NOA
})
```

`<expr>` là:
```js
"string"                     // shorthand EQ(field, string)
{ eq: "x" }                  // EQ string
{ ne: "x" }                  // NE
{ prefix: "x" }              // PRE (startsWith)
{ suffix: "x" }              // SUF
{ includes: "x" }            // INCLUDES
{ regex: "^\\d+$" }          // REGEX
{ lt: 100 }, { gt: 100 }, { lte: 100 }, { gte: 100 }  // numeric compare
{ and: [<expr>...] }         // AND
{ or:  [<expr>...] }         // OR
{ not: <expr> }              // NOT
{ type: "string" | "number" | "null" | "bool" }   // type check
{ length: [min, max] }       // LNG
{ seg: { sep: "_", idx: 0, match: <expr> } }  // SEG
{ let: { bind: 0, def: <expr>, body: <expr> } } // LET
{ if: { cond: <expr>, then: <expr>, else: <expr> } } // IF
{ reg: 128 }                 // REG(n) — reference a LET binding
{ divu: [<expr>, <expr>] }   // DIVU — integer floor division
{ mod: [<expr>, <expr>] }    // MOD
{ add: [<expr>, <expr>] }    // ADD
{ sub: [<expr>, <expr>] }    // SUB
```

### 4.4 Helper: `sea.candle(spec)` — temporal shorthand (Tầng 1)

Candle number = `Math.floor(timestamp_ms / size_ms)`.
Đây là helper ở Tầng 1, compile xuống expression thuần túy rồi truyền vào `sea.pen()`.

```js
// Helper: validate rằng key segment idx chứa valid candle number trong window
sea.candle = function(opts) {
    // opts: { seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 }
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
sea.pen({
    key: { and: [
        sea.candle({ seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 }),
        { seg: { sep: "_", idx: 3, of: { reg: 0 }, match: { or: [{ eq: "buy" }, { eq: "sell" }] } } }
    ]},
    sign: true
})
```

`candle` không phải opcode. Nó là sugar reduce xuống LET + DIVU + GTE + LTE + SEG + TONUM.

### 4.5 Helper: `sea.pow(opts)` — Proof of Work shorthand

PoW verification là: `SHA256(val).startsWith("000...difficulty_zeros")`

Cách implement trong PEN: host extension opcode `0xC4` = POW — vì SHA256 là async, không thể model trong sync expression tree. Pipeline stage xử lý async trước khi gọi check.next.

```js
// Policy-level (async, handled by GUN layer)
sea.pen({ pow: { field: "key", difficulty: 3 } })
// → bytecode chứa 0xC4 [u8 field_reg] [u8 difficulty]
// → GUN pipeline: async verify SHA256(R[field]).hex.startsWith("000") trước pipe.next
```

---

## 5. PEN Core VM — `lib/pen.js`

```js
// lib/pen.js — standalone, no GUN dependency, no Date.now(), no crypto
// Có thể dùng độc lập:
//   var pen = require('./lib/pen')
//   var ok = pen.run(bytecode, registers)   // → boolean

var pen = {};

pen.run = function(bc, regs) {
    if (!bc || bc[0] !== 0x01) throw new Error('PEN: bad version');
    var ext = null; // optional host extension handler
    var pos = { i: 1 };
    return !!pen.eval(bc, pos, regs, {});
};

// Allow host to register extension opcode handler
pen.extend = function(fn) { pen._ext = fn; };

pen.eval = function(bc, pos, regs, locals) {
    var op = bc[pos.i++];

    // Constants
    if (op === 0x00) return null;
    if (op === 0x01) return true;
    if (op === 0x02) return false;
    if (op === 0x03) {
        var len = bc[pos.i++], s = '';
        for (var i = 0; i < len; i++) s += String.fromCharCode(bc[pos.i++]);
        return s;
    }
    if (op === 0x04) { // UINT varint (ULEB128)
        var n = 0, shift = 0, b;
        do { b = bc[pos.i++]; n |= (b & 0x7F) << shift; shift += 7; } while (b & 0x80);
        return n >>> 0;
    }
    if (op === 0x07) { // INT varint (SLEB128)
        var n = 0, shift = 0, b;
        do { b = bc[pos.i++]; n |= (b & 0x7F) << shift; shift += 7; } while (b & 0x80);
        if (shift < 32 && (b & 0x40)) n |= -(1 << shift);
        return n;
    }
    if (op === 0x08) { /* f64 from 8 bytes */
        var dv = new DataView(new ArrayBuffer(8));
        for (var i = 0; i < 8; i++) dv.setUint8(i, bc[pos.i++]);
        return dv.getFloat64(0);
    }

    // Register
    if (op === 0x10) {
        var n = bc[pos.i++];
        if (n >= 128) return locals[n - 128];
        return regs[n];
    }
    // Register shorthands (0xF0–0xF5 = R[0]–R[5], 0xF8–0xFB = local[0]–local[3])
    if (op >= 0xF0 && op <= 0xF5) return regs[op - 0xF0];
    if (op >= 0xF8 && op <= 0xFB) return locals[op - 0xF8];

    // Logic
    if (op === 0x20) { // AND
        var n = bc[pos.i++], ok = true;
        for (var i = 0; i < n; i++) { var r = pen.eval(bc, pos, regs, locals); if (!r) ok = false; }
        return ok;
    }
    if (op === 0x21) { // OR
        var n = bc[pos.i++], ok = false;
        for (var i = 0; i < n; i++) { var r = pen.eval(bc, pos, regs, locals); if (r) ok = true; }
        return ok;
    }
    if (op === 0x22) return !pen.eval(bc, pos, regs, locals); // NOT
    if (op === 0x23) return true;
    if (op === 0x24) return false;

    // Comparison
    if (op >= 0x30 && op <= 0x35) {
        var a = pen.eval(bc, pos, regs, locals), b = pen.eval(bc, pos, regs, locals);
        if (op === 0x30) return a === b;
        if (op === 0x31) return a !== b;
        var an = typeof a === 'number' ? a : parseFloat(a);
        var bn = typeof b === 'number' ? b : parseFloat(b);
        if (op === 0x32) return an < bn;
        if (op === 0x33) return an > bn;
        if (op === 0x34) return an <= bn;
        if (op === 0x35) return an >= bn;
    }

    // Arithmetic
    if (op >= 0x40 && op <= 0x47) {
        var a = pen.eval(bc, pos, regs, locals), b;
        var an = typeof a === 'number' ? a : parseFloat(a);
        if (op !== 0x46 && op !== 0x47) { b = pen.eval(bc, pos, regs, locals); }
        var bn = (b !== undefined) ? (typeof b === 'number' ? b : parseFloat(b)) : 0;
        if (op === 0x40) return an + bn;
        if (op === 0x41) return an - bn;
        if (op === 0x42) return an * bn;
        if (op === 0x43) return Math.floor(an / bn);   // DIVU
        if (op === 0x44) return an % bn;               // MOD
        if (op === 0x45) return an / bn;               // DIVF
        if (op === 0x46) return Math.abs(an);
        if (op === 0x47) return -an;
    }

    // String ops
    if (op === 0x50) { var s = String(pen.eval(bc, pos, regs, locals)); return s.length; }
    if (op === 0x51) {
        var s = String(pen.eval(bc, pos, regs, locals));
        var st = pen.eval(bc, pos, regs, locals), en = pen.eval(bc, pos, regs, locals);
        return s.slice(st, en);
    }
    if (op === 0x52) { // SEG(str_expr, sep_byte, idx_expr)
        var s = String(pen.eval(bc, pos, regs, locals));
        var sep = String.fromCharCode(bc[pos.i++]);
        var idx = pen.eval(bc, pos, regs, locals);
        var parts = s.split(sep);
        return (idx < 0 ? parts[parts.length + idx] : parts[idx]) || '';
    }
    if (op === 0x53) { return parseFloat(String(pen.eval(bc, pos, regs, locals))); }
    if (op === 0x54) { return String(pen.eval(bc, pos, regs, locals)); }
    if (op === 0x55) { var a = String(pen.eval(bc, pos, regs, locals)), b = String(pen.eval(bc, pos, regs, locals)); return a + b; }
    if (op === 0x56) { var s = String(pen.eval(bc, pos, regs, locals)), p = String(pen.eval(bc, pos, regs, locals)); return s.slice(0, p.length) === p; }
    if (op === 0x57) { var s = String(pen.eval(bc, pos, regs, locals)), p = String(pen.eval(bc, pos, regs, locals)); return s.slice(-p.length) === p; }
    if (op === 0x58) { var s = String(pen.eval(bc, pos, regs, locals)), n = String(pen.eval(bc, pos, regs, locals)); return s.indexOf(n) >= 0; }
    if (op === 0x59) { var s = String(pen.eval(bc, pos, regs, locals)), p = String(pen.eval(bc, pos, regs, locals)); try { return new RegExp(p).test(s); } catch(e) { return false; } }
    if (op === 0x5A) { return String(pen.eval(bc, pos, regs, locals)).toUpperCase(); }
    if (op === 0x5B) { return String(pen.eval(bc, pos, regs, locals)).toLowerCase(); }

    // Type checks
    if (op === 0x60) { var v = pen.eval(bc, pos, regs, locals); return typeof v === 'string'; }
    if (op === 0x61) { var v = pen.eval(bc, pos, regs, locals); return typeof v === 'number' && isFinite(v); }
    if (op === 0x62) { var v = pen.eval(bc, pos, regs, locals); return v === null; }
    if (op === 0x63) { var v = pen.eval(bc, pos, regs, locals); return typeof v === 'boolean'; }
    if (op === 0x64) { // LNG
        var s = String(pen.eval(bc, pos, regs, locals));
        var mn = bc[pos.i++], mx = bc[pos.i++];
        return s.length >= mn && s.length <= mx;
    }

    // LET
    if (op === 0x70) {
        var n = bc[pos.i++]; // local slot
        var val = pen.eval(bc, pos, regs, locals); // evaluate def
        var newLocals = Object.assign({}, locals);
        newLocals[n] = val;
        return pen.eval(bc, pos, regs, newLocals); // evaluate body with binding
    }

    // IF
    if (op === 0x71) {
        var cond = pen.eval(bc, pos, regs, locals);
        var then_ = pen.eval(bc, pos, regs, locals);
        var else_ = pen.eval(bc, pos, regs, locals);
        return cond ? then_ : else_;
    }

    // SEGR macros (0x80–0x81 optimization)
    if (op === 0x80) { // SEG(REG[r], sep, idx) — 4 bytes inline
        var r = bc[pos.i++], sep = String.fromCharCode(bc[pos.i++]), idx = bc[pos.i++];
        var s = String(r < 128 ? regs[r] : locals[r - 128]);
        var parts = s.split(sep);
        return (idx < 0 ? parts[parts.length + idx] : parts[idx]) || '';
    }
    if (op === 0x81) { // TONUM(SEG(REG[r], sep, idx)) — 4 bytes inline
        var r = bc[pos.i++], sep = String.fromCharCode(bc[pos.i++]), idx = bc[pos.i++];
        var s = String(r < 128 ? regs[r] : locals[r - 128]);
        var parts = s.split(sep);
        return parseFloat((idx < 0 ? parts[parts.length + idx] : parts[idx]) || '0');
    }

    // Host extension
    if (op >= 0xC0 && pen._ext) return pen._ext(op, bc, pos, regs, locals);

    throw new Error('PEN: unknown opcode 0x' + op.toString(16));
};

if (typeof module !== 'undefined') module.exports = pen;
```

### Giới hạn an toàn (trong GUN bridge, không trong core)

- Max bytecode: 512 bytes
- Max recursion depth: 64 (tracked bởi GUN bridge wrapper)
- Max string constant: 255 bytes

---

## 6. Tích hợp vào `sea/index.js`

### 6.1 Routing

```js
// Routing dispatch — thêm sau check hash, trước else → any:
else if ('$' === soul[0]) pipeline.push(check.pipe.pen);
```

### 6.2 `check.pipe.pen` stage

```js
check.pipe.pen = function(ctx, next, reject) {
    var soul = ctx.soul, key = ctx.key, val = ctx.val;
    var state = ctx.state, at = ctx.at, msg = ctx.msg, eve = ctx.eve;

    // 1. Decode bytecode (cached by soul string)
    at._penCache = at._penCache || {};
    var bc;
    if (at._penCache[soul]) {
        bc = at._penCache[soul];
    } else {
        try { bc = SEA.base62.penunpack(soul.slice(1)); } catch(e) { return reject("Invalid PEN soul."); }
        if (!bc || bc.length < 2) return reject("PEN: empty bytecode.");
        if (bc.length > 512) return reject("PEN: bytecode too large.");
        at._penCache[soul] = bc;
    }

    // 2. Policy scan pass (host extension opcodes 0xC0..0xC3)
    var policy = check.pen.scanpolicy(bc);

    // 3. Build registers
    var rawVal = typeof val === 'string' ? val : JSON.stringify(val);
    var regs = [key, rawVal, soul, state || 0, Date.now(), ctx.pub || ''];

    // 4. Run PEN core (predicate only)
    var result;
    try { result = pen.run(bc, regs); } catch(e) { return reject("PEN VM: " + (e.message || e)); }
    if (!result) return reject("PEN: predicate failed.");

    // 5. Apply policy
    if (policy.open || (!policy.sign && !policy.cert && !policy.pow)) {
        return check.next(eve, msg, reject);
    }
    if (policy.pow) {
        // Async PoW verify before forwarding
        return SEA.work(regs[policy.pow.field], null, function(hash) {
            var prefix = '0'.repeat(policy.pow.difficulty);
            if (!hash.startsWith(prefix)) return reject("PEN: PoW insufficient.");
            check.pen.applysign(policy, ctx, next, reject, eve, msg);
        }, { name: 'SHA-256', encode: 'hex' });
    }
    check.pen.applysign(policy, ctx, next, reject, eve, msg);
};

check.pen.scanpolicy = function(bc) {
    var policy = { sign: false, cert: null, open: false, pow: null };
    for (var i = 1; i < bc.length; i++) {
        var op = bc[i];
        if (op === 0xC0) { policy.sign = true; }
        else if (op === 0xC1) {
            var len = bc[i + 1]; i++;
            var pub = '';
            for (var j = 0; j < len; j++) pub += String.fromCharCode(bc[i + 1 + j]);
            i += len; policy.cert = pub;
        }
        else if (op === 0xC3) { policy.open = true; }
        else if (op === 0xC4) { policy.pow = { field: bc[i+1], difficulty: bc[i+2] }; i += 2; }
    }
    return policy;
};

check.pen.applysign = function(policy, ctx, next, reject, eve, msg) {
    var at = ctx.at, user = at.user || '';
    if (policy.cert) {
        var raw = {}; try { raw = JSON.parse(ctx.val) || {}; } catch(e) {}
        if (!raw['+'] || !raw['*']) return reject("PEN: cert required.");
        return check.$vfy(eve, msg, ctx.key, ctx.soul, policy.cert, reject, raw['+'], raw['*'], function() {
            check.next(eve, msg, reject);
        });
    }
    var sec = check.$sea(msg, user, null);
    if (!sec.authenticator) return reject("PEN: signature required.");
    check.auth(msg, reject, sec.authenticator, function() { check.next(eve, msg, reject); });
};
```

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
var orderSoul = '$' + sea.pen({
    key: { and: [
        sea.candle({ seg: 0, sep: "_", size: 300000, back: 100, fwd: 2 }),
        { seg: { sep: "_", idx: 3, of: { reg: 0 },
                 match: { or: [{ eq: "buy" }, { eq: "sell" }] } } }
    ]},
    sign: true
})
// → "$abc..." (~94 base62 chars)
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

## 8. Kế hoạch triển khai

| # | File | Nội dung | Priority |
|---|------|---------|---------|
| 1 | `sea/base62.js` | Thêm `penpack`, `penunpack`, `b62enc`, `b62dec` | P0 |
| 2 | `lib/pen.js` | PEN core VM standalone — không import gì của GUN | P0 |
| 3 | `sea/pen.js` | GUN-PEN bridge: `sea.pen()`, `sea.candle()`, policy opcodes | P1 |
| 4 | `sea/index.js` | Routing `'$' === soul[0]`, `check.pipe.pen`, import pen.js | P1 |
| 5 | `sea.js` | Rebuild: `npm run buildSea` | P1 |
| 6 | `test/pen.js` | Unit tests: ISA, LET, candle, adversarial | P2 |

> `lib/pen.js` là file **độc lập hoàn toàn** — không require bất kỳ file GUN nào.
> Khi tách thành `akaoio/pen`, chỉ cần copy file này + `sea/base62.js` phần `penpack/penunpack`.

---

## 9. Roadmap

```
akaoio/gun (hiện tại)
  lib/pen.js          ← PEN core VM (JS)
  sea/pen.js          ← GUN bridge
  sea/index.js        ← integration

akaoio/pen (tương lai)
  pen.js              ← same PEN core
  pen.zig             ← Zig port (same ISA)
  compiler.js         ← high-level spec → bytecode
  README.md

akao/shop (application)
  Dùng sea.pen() API  ← order/dispute/trade namespaces
```

Zig port: ISA v1 là fixed spec — không thay đổi opcode meanings sau khi publish. Version byte (`0x01`) cho phép thêm ISA v2 sau này.
