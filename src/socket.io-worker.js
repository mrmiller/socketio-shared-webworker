'use strict';

const EventEmitter = require('eventemitter3')
const io = require('socket.io-client')
require('../dist/shared-worker-inline.js')

class SharedWorkerSocketIO {

    WorkerType = global.SharedWorker || global.Worker
    worker = null
    workerUri = null
    socketUri = null
    events = new EventEmitter()
    socket = null
    options = null
    nextAckId = 0
    callbacks = {}

    constructor(socketUri, options) {
        this.log('SharedWorkerSocketIO ', socketUri)
        this.socketUri = socketUri
        this.options = options
    }

    startSocketIo() {
        this.socket = io(this.socketUri, this.options)
    }

    startWorker(worker) {
      this.started = true
      if (!worker) {
          const workerUri = this.getWorkerUri()
          this.log('Starting Worker', this.WorkerType, workerUri)
          worker = new this.WorkerType(workerUri, {
              name: this.socketUri,
              options: this.options
          })
      }
      this.worker = worker;
        const port = this.worker.port || this.worker
        port.onmessage = event => {
            if (event.data.id !== undefined) {
                const cb = this.callbacks[event.data.id];
                delete this.callbacks[event.data.id];
                if (!cb) {
                  this.log('Mismatched ack id for emit callback: ', event.data.id);
                  return;
                }
                cb(event.data.message);
            } else {
                this.log('<< worker received message:', event.data.type, event.data.message)
                this.events.emit(event.data.type, event.data.message)
            }
        }
        this.worker.onerror = event => {
            this.log('worker error', event)
            this.events.emit('error', event)
        }
        this.log('worker started')
    }

    emit(event, ...args) {
        let cb = null
        if (args.length > 0 && typeof args[args.length - 1] === 'function') {
          cb = args[args.length - 1]
          args.pop()
        }
        this.log('>> emit:', event, args, cb)
        if (this.worker) {
            const port = this.worker.port || this.worker
            const id = cb ? (this.nextAckId ++) : undefined;
            port.postMessage({
                eventType: 'emit',
                event,
                data: args,
                id
            })
            if (cb) {
              this.callbacks[id] = cb;
            }
        } else {
            this.socket.emit(...arguments)
        }
    }

    on(event, cb) {
        if (this.worker) {
            this.log('worker add handler on event:', event)
            const port = this.worker.port || this.worker
            port.postMessage({
                eventType: 'on',
                event: event
            })
            this.events.on(event, cb)
        } else {
            this.log('socket add handler on event:', event)
            this.socket.on(...arguments)
        }
    }

    start() {
        try {
            this.log('Attempting to start socket.io shared webworker')
            this.startWorker()
        } catch (e) {
            this.log('Error starting socket.io shared webwoker', e)
            this.log('Starting socket.io instead')
            this.worker = null // disable worker
            this.startSocketIo()
        }
    }

    setWorkerType(WorkerType) {
        this.log('Setting WorkerType', WorkerType)
        this.WorkerType = WorkerType
    }

    getWorkerObjectUrl() {
        const script = '(' + global.SocketIoSharedWorker.toString() + ')()'
        return global.URL.createObjectURL(new Blob([script], {type: 'application/javascript'}))
    }

    getWorkerUri() {
        return this.workerUri || this.getWorkerObjectUrl()
    }

    useWorker(uri) {
        this.log('Starting worker', uri)
        this.workerUri = uri
        if (!this.started) {
            this.start()
        }
    }

    /**
     * @deprecated
     */
    setWorker = this.useWorker

}

SharedWorkerSocketIO.prototype.log = console.log.bind(console)

module.exports = global.wio = (uri, options) => new SharedWorkerSocketIO(uri, options)