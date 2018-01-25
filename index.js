const _ = require('lodash')
const jaeger = require('jaeger-client')
const UDPSender = require('jaeger-client/dist/src/reporters/udp_sender').default
const { Tags } = jaeger.opentracing

class JaegerStore {
  constructor (opts = {}) {
    this._reporter = opts.reporter || new jaeger.RemoteReporter(new UDPSender())
    this._sampler = opts.sampler || new jaeger.ConstSampler(true)
  }

  save (record, ctx) {
    if (record.type === 'start') {
      ctx._spans = []
      return
    }
    if (!ctx._tracer) {
      ctx._tracer = new jaeger.Tracer(record.name, this._reporter, this._sampler)
      // add rootSpan
      ctx._spans.push(ctx._tracer.startSpan(`${ctx.method} ${ctx._matchedRoute}`))
    }

    if (record.type === 'beforeAwait') {
      const tags = {
        [Tags.HTTP_URL]: ctx.url,
        requestId: record.requestId,
        filename: record.filename
      }

      const parentSpan = getParentSpan()
      let span
      if (parentSpan) {
        span = ctx._tracer.startSpan(record.fn, {
          childOf: parentSpan,
          startTime: record.timestamp.getTime(),
          tags
        })
      } else {
        span = ctx._tracer.startSpan(record.fn, {
          childOf: getLastSpan(),
          startTime: record.timestamp.getTime(),
          tags
        })
      }

      span._fn = record.fn
      span._type = record.type
      ctx._spans.push(span)
      return
    }

    if (record.type === 'afterAwait') {
      const span = _.find(ctx._spans, { _fn: record.fn, _type: 'beforeAwait' })
      if (span) {
        span._type = 'afterAwait'
        span.log({ fn: record.fn })
        span.finish()
      }
      return
    }

    if (record.type === 'error') {
      const lastSpan = getLastSpan()
      if (lastSpan) {
        lastSpan.setTag(Tags.ERROR, true)
        lastSpan.log({
          fn: record.fn,
          errMsg: record.error.message,
          errStack: record.error.stack
        })
      }
      finishAll()
      return
    }

    if (record.type === 'end') {
      finishAll()
    }

    function getLastSpan () {
      return ctx._spans[ctx._spans.length - 1]
    }

    function getParentSpan () {
      return _.findLast(ctx._spans, { _type: 'beforeAwait' })
    }

    function finishAll () {
      _.each(ctx._spans, (span) => span.finish())
    }
  }
}

module.exports = JaegerStore
