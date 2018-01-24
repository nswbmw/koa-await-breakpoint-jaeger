const path = require('path')
const JaegerStore = require('..')
const koaYieldBreakpoint = require('koa-await-breakpoint')({
  name: 'api',
  files: [path.join(__dirname, '**/*.js')],
  store: new JaegerStore()
})

const Koa = require('koa')
const Router = require('koa-router')
const app = new Koa()
const router = new Router()

app.use(koaYieldBreakpoint)

router.post('/users', require('./routes/users').createUser)

app.use(router.routes())
app.use(router.allowedMethods())

app.listen(3000, () => {
  console.log('listening on 3000')
})
