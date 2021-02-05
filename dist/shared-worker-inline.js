'use strict';

const SharedWorker = () => {
    const log = console.log.bind(console)

    log('Loading shared worker', self.name)

    try {
        importScripts(self.name + 'socket.io/socket.io.js')
    } catch(e) {
        io = require('socket.io-client')
    }

    let socket = io(self.name, self.options),
        ports = [],
        socketConnected = false

    // handle shared webworker clients already with ports
    socket.on('connect', function(msg) {
        socketConnected = true
        ports.forEach(function(port) {
            port.postMessage({
                type: 'connect',
                message: [msg]
            })
        })
    })
    socket.on('disconnect', function(msg) {
        socketConnected = false
        ports.forEach(function(port) {
            port.postMessage({
                type: 'disconnect',
                message: [msg]
            })
        })
    })
    if (!socket.onAny) {
      const anyListeners = []
      socket.onAny = (cb) => {
        anyListeners.push(cb)
      }
      const onevent = socket.onevent.bind(socket);
      socket.onevent = (packet) => {
          let [event, ...args] = packet.data;
          anyListeners.forEach((l) => {
            l(event, ...args)
          })
          onevent(packet) // call the base version
      }
    }
    socket.onAny((type, ...message) => {
        log('socket received message', ...message)
        ports.forEach((port) => {
            port.postMessage({ type, message })
        })
    })

    // shared worker handle new clients
    addEventListener('connect', function(event) {
        const port = event.ports[0]
        ports.push(port)
        port.start()

        log('client connected to shared worker', event)

        port.addEventListener('message', event => handleMessage(event, port))
    })

    // regular worker handle messages
    addEventListener('message', event => handleMessage(event, self))
    if (typeof Worker !== 'undefined') {
        setTimeout(() => postMessage({
            type: 'connect',
            message: []
        }))
    }

    // handle messages
    function handleMessage(event, port) {
            
        const model = event.data
        log('port received message', model.eventType, model.event, model.data)
        switch(model.eventType) {
            case 'on':
                const eventName = model.event
                if (eventName == 'connect') {
                    if (socketConnected) {
                        port.postMessage({
                            type: eventName
                        })
                    }
                    break;
                }
                if (eventName == 'disconnect') {
                    break;
                }
                socket.on(eventName, (...message) => {
                    log('socket received message', ...msg)
                    port.postMessage({
                        type: eventName,
                        message
                    })
                })
                break;
            case 'emit':
                if (model.id !== undefined) {
                    socket.emit(model.event, ...model.data, (data) => {
                        port.postMessage({
                            type: 'emitAck',
                            id: model.id,
                            message: [data]
                        })
                    })
                } else {
                    socket.emit(model.event, ...model.data)
                }
                break;
        }

    }
}

if (typeof window === 'object') {
    window.SocketIoSharedWorker = SharedWorker
}

if (typeof module === 'object') {
    module.exports = SharedWorker
} else {
    SharedWorker()
}