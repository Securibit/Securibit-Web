# Securibit Website - Documentation
A TOTP 2FA Authencator website.
## Usage
...

## Website Structure
### Internal API
#### ADDR
路徑：`/api/{name}?lebel_1=val_1&label2=val_2&...`
#### 功能表
| API | Input | Output | intro |
| --- | --- | --- | --- |
| filename | req.query: { key: value } | res: { key: value } | intro |


### Extenal API
| Content | Provider |
| -------- | -------- |
| ... | ... |

### Resources
| Content | Service |
| ---- | ---- |
| Code Backend | Firebase |
| API Backend Server | Netlify |
| Frontend Server | Netlify |

## Hot Reloading & Deployment
### pnpm (recommendation)
```bash
# install necessary pkg
pnpm i
# hot reloading dev
pnpm dev
# deploy & compile
pnpm build
```
### npm (Not recommended)
```bash
# install necessary pkg
npm i
# hot reloading dev
npm run dev
# deploy & compile
npm run build
```
### yarn (Not recommended)
```bash
# install necessary pkg
yarn
# hot reloading dev
yarn dev
# deploy & compile
yarn build
```