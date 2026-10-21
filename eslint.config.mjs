import next from 'eslint-config-next'

const config = [
  {
    ignores: ['.next/**', 'node_modules/**', 'out/**'],
  },
  ...next,
]

export default config
