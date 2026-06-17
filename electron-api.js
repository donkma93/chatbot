const Module = require('module')
const orig = Module._load
module.exports = orig.call(Module, 'electron', null, true)
