chrome.runtime.onConnect.addListener(function(port) {
  if(port.name !== 'DEBUG_CONSOLE_LOG') return;
  console = {
    log: function(message) {
      port.postMessage({type: 'log', message: message});
    },
    info: function(message) {
      port.postMessage({type: 'info', message: message});
    },
    warn: function(message) {
      port.postMessage({type: 'warn', message: message});
    },
    error: function(message) {
      port.postMessage({type: 'error', message: message});
    },
    debug: function(message) {
      port.postMessage({type: 'debug', message: message});
    }
  };
});
