// 加密密碼的託管金鑰工具（只用 Node 內建的 Web Crypto，不需要安裝套件）
//
// 團隊保管一把離線的 P-256 私鑰。使用者設定或變更加密密碼時，網站與 App 會用團隊的公鑰
// 把密碼加密成託管密文（esc:v1:...）存到資料庫；只有拿著私鑰才能解開。
//
// 格式（網站與 App 必須一致）：
//   esc:v1:<kid>:<epk>:<iv>:<ct>（base64）
//   kid    公鑰（65 bytes 未壓縮）SHA-256 的前 16 個十六進位字元
//   epk    一次性的 P-256 公鑰（65 bytes 未壓縮）
//   shared ECDH(一次性私鑰, 團隊公鑰) 的 x 座標（32 bytes）
//   key    HKDF-SHA256(shared, salt = epk, info = "securibit-escrow-v1", 32 bytes)
//   ct     AES-256-GCM(key, iv, 密碼, AAD = "securibit-escrow-v1:" + 使用者 id)，含 16 bytes tag
//
// 用法：
//   產生金鑰（請在離線的電腦上執行，私鑰檔只存在你指定的位置）
//     node scripts/escrow.mjs keygen <私鑰輸出路徑>
//   用公鑰加密（測試用）
//     node scripts/escrow.mjs encrypt <公鑰 base64> <使用者 id> <密碼>
//   用私鑰解開託管密文
//     node scripts/escrow.mjs decrypt <私鑰路徑> <使用者 id> <esc:v1:...>
import { webcrypto as crypto } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const INFO = 'securibit-escrow-v1'
const PREFIX = 'esc:v1:'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

const b64 = (bytes) => Buffer.from(bytes).toString('base64')
const unb64 = (value) => new Uint8Array(Buffer.from(value, 'base64'))

export const keyId = async (rawPublic) =>
  Buffer.from(await crypto.subtle.digest('SHA-256', rawPublic)).toString('hex').slice(0, 16)

const aesKey = async (privateKey, publicKey, epkRaw, usage) => {
  const shared = await crypto.subtle.deriveBits({ name: 'ECDH', public: publicKey }, privateKey, 256)
  const ikm = await crypto.subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: epkRaw, info: encoder.encode(INFO) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  )
}

export const encrypt = async (publicB64, userId, passphrase) => {
  const teamRaw = unb64(publicB64)
  const team = await crypto.subtle.importKey('raw', teamRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const epk = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey))
  const key = await aesKey(eph.privateKey, team, epk, 'encrypt')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${INFO}:${userId}`) },
    key,
    encoder.encode(passphrase)
  )
  return `${PREFIX}${await keyId(teamRaw)}:${b64(epk)}:${b64(iv)}:${b64(new Uint8Array(ct))}`
}

export const decrypt = async (privatePem, userId, envelope) => {
  if (!envelope.startsWith(PREFIX)) throw new Error('不是託管密文（應該以 esc:v1: 開頭）')
  const [kid, epkB64, ivB64, ctB64] = envelope.slice(PREFIX.length).split(':')
  const der = unb64(privatePem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''))
  const priv = await crypto.subtle.importKey('pkcs8', der, { name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const jwk = await crypto.subtle.exportKey('jwk', priv)
  const pubRaw = new Uint8Array([4, ...Buffer.from(jwk.x, 'base64url'), ...Buffer.from(jwk.y, 'base64url')])
  if ((await keyId(pubRaw)) !== kid) throw new Error(`金鑰不符：密文用的是 ${kid}，這把私鑰是 ${await keyId(pubRaw)}`)
  const epk = unb64(epkB64)
  const ephPublic = await crypto.subtle.importKey('raw', epk, { name: 'ECDH', namedCurve: 'P-256' }, false, [])
  const key = await aesKey(priv, ephPublic, epk, 'decrypt')
  const plain = await crypto.subtle
    .decrypt(
      { name: 'AES-GCM', iv: unb64(ivB64), additionalData: encoder.encode(`${INFO}:${userId}`) },
      key,
      unb64(ctB64)
    )
    .catch(() => {
      throw new Error('解不開：使用者 id 不對，或密文損毀')
    })
  return decoder.decode(plain)
}

const keygen = async (out) => {
  if (!out) throw new Error('請指定私鑰的輸出路徑')
  if (existsSync(out)) throw new Error(`${out} 已經存在，不會覆蓋`)
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
  const pkcs8 = b64(new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey)))
  const pem = `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join('\n')}\n-----END PRIVATE KEY-----\n`
  writeFileSync(out, pem, { mode: 0o600 })
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  console.log(JSON.stringify({ publicKey: b64(raw), keyId: await keyId(raw) }, null, 2))
  console.error(`私鑰已存到 ${out}，請離線保存，不要放進任何專案或雲端`)
}

const [command, ...args] = process.argv.slice(2)
const run = {
  keygen: () => keygen(args[0]),
  encrypt: async () => console.log(await encrypt(args[0], args[1], args[2])),
  decrypt: async () => console.log(await decrypt(readFileSync(args[0], 'utf8'), args[1], args[2])),
}[command]

if (run) {
  run().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
} else if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('用法：node scripts/escrow.mjs keygen|encrypt|decrypt ...（說明見檔案開頭）')
  process.exit(1)
}
