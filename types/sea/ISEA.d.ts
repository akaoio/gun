import { ISEAPair, Policy } from '.';

/**
 * Security, Encryption, and Authorization system used with GUN
 */
export interface ISEA {
  /** Last known error */
  err?: string;

  /**
   * This gives you a Proof of Work (POW) / Hashing of Data
   *
   * @param data The data to be hashed, work to be performed on
   * @param pair (salt) You can pass pair of keys to use as salt.
   *  Salt will prevent others to pre-compute the work, so using
   *  your public key is not a good idea. If it is not specified, it
   *  will be random, which ruins your chance of ever being able to
   *  re-derive the work deterministically
   * @param callback function to executed upon execution of proof
   * @param options default: `{ name: 'PBKDF2', encode: 'base64' }`
   * @returns a promise with a string - hash of data if successful,
   *  otherwise - undefined
   */
  work(
    data: any,
    pair?: ISEAPair | null,
    callback?: ((data: string | undefined) => void) | null,
    options?: {
      name?: 'SHA-256' | 'PBKDF2';
      encode?: 'base64' | 'utf8' | 'hex';
      salt?: any;
      hash?: string;
      length?: number;
    }
  ): Promise<string | undefined>;

  /**
   * This generates a cryptographically secure public/private key pair - be careful not to leak the private keys!
   * Note: API subject to change we may change the parameters to accept data and work, in addition to generation.
   * You will need this for most of SEA's API, see those method's examples.
   * The default cryptographic primitives for the asymmetric keys are ECDSA for signing and ECDH for encryption.
   * 
   * @param callback Optional callback to be called with the generated key pair
   * @param opt Optional configuration object that can contain seed, priv, or epriv
   */
  pair(
    callback?: (data: ISEAPair) => void | null,
    opt?: {
      seed?: string;
      priv?: string;
      epriv?: string;
    }
  ): Promise<ISEAPair>;

  /**
   * Adds a signature to a message, for data that you want to
   *  prevent attackers tampering with. The default
   *  cryptographic primitive signs a SHA256 fingerprint of the
   *  data. Also supports WebAuthn signatures.
   *
   * @param data the content that you want to prove is authorized
   * @param pair SEA pair or a function that returns a WebAuthn signature or string
   * @param cb Optional callback function
   * @param opt Optional options object
   */
  sign(
    data: any, 
    pair: { priv: string; pub: string } | ((data: any) => Promise<{ signature?: any; authenticatorData?: any; clientDataJSON?: any } | string>), 
    cb?: (data: string | undefined) => void,
    opt?: {
      encode?: 'base64' | 'utf8' | 'hex';
      raw?: boolean;
      check?: any;
      why?: string;
    }
  ): Promise<string | undefined>;

  /**
   * Do you want to allow others to write to parts of your own
   *  organization's graph without sharing your keypair with
   *  them? Then this feature is for you! With SEA.certify, you
   *  can create a cryptographically signed Certificate that
   *  gives other people write permission. A Certificate
   *  describes WHO has the right to write to your graph, WHERE
   *  they can write, and (pending security review) until WHEN.
   *  The Certificate should not be encrypted because it must be
   *  plain text so that it is interpretable by any and every
   *  peer and machine in the network, so every peer enforces
   *  the same security rules, whether it is a browser, phone,
   *  IoT device, or relay
   *
   * @see https://gun.eco/docs/SEA.certify
   *
   * @param who Who the certificate is for. These are the people you allow to
   *  write to your own graph
   * @param policy The rules of the Certificate
   * @param authority Certificate Authority or Certificate Issuer.
   *  This is your priv, or your key pair
   * @param callback A callback function that runs after a
   *  Certificate is created
   */
  certify(
    who: '*' | string | string[] | { pub: string } | { pub: string }[],
    policy: Policy,
    authority: { priv: string; pub: string },
    callback?: () => void,
    options?: {
      /**
       * A timestamp (ie. `Date.now() + 10000` or `Gun.state() + 10000`)
       * to set the Certificate to expire in the future
       *
       * If `options.expiry` IS NOT SET, the Certificate is valid PERMANENTLY, and this is
       *  dangerous!
       */
      expiry: number;
    }
  ): Promise<string>;

  /**
   * Gets the data if and only if the message can be verified
   *  as coming from the person you expect
   *
   * @param message what comes from `.sign`
   * @param pair from `.pair` or its public key text (`pair.pub`). 
   *        Se impostato a `false`, restituisce i dati senza verifica
   * @param cb Optional callback to execute with the verified data
   * @param opt Optional options object
   * @returns the data if and only if the message can be
   *  verified as coming from the person you expect
   */
  verify<T extends unknown = any>(
    message: string,
    pair: string | { pub: string } | boolean,
    cb?: (data: T | undefined) => void,
    opt?: {
      encode?: 'base64' | 'utf8' | 'hex';
    }
  ): Promise<T | undefined>;

  /**
   * Takes some data that you want to keep secret and encrypts
   *  it so nobody else can read it
   *
   * @param data the content that you want to encrypt
   * @param pair from `.pair` to use as a cypher to encrypt with
   */
  encrypt(data: any, pair: { epriv: string }): Promise<string>;

  /**
   * Takes some data that you want to keep secret and encrypts
   *  it so nobody else can read it
   *
   * @param data the content that you want to encrypt
   * @param passphrase the passphrase you want to use as a cypher to encrypt with
   */
  encrypt(data: any, passphrase: string): Promise<string>;

  /**
   * Read the secret data, if and only if you are allowed to
   *
   * @param message what comes from `.encrypt`
   * @param pair from `.pair` to decypher the message
   */
  decrypt<T extends unknown = any>(
    message: string,
    pair: { epriv: string }
  ): Promise<T>;

  /**
   * Read the secret data, if and only if you are allowed to
   *
   * @param message what comes from `.encrypt`
   * @param passphrase the passphrase to decypher the message
   */
  decrypt<T extends unknown = any>(
    message: string,
    passphrase: string
  ): Promise<T>;

  /**
   * Derive shared secret from other's pub and my epub/epriv
   *
   * @param key other's public encryption key
   * @param pair encryption key pair from `.pair`
   * @param callback A callback function that runs after a secret is created
   */
  secret(
    key: string | { epub: string },
    pair: { epriv: string; epub: string },
    callback?: (secret: string | undefined) => void
  ): Promise<string | undefined>;
}
