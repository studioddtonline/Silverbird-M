var port = chrome.runtime.connect({name: 'DEBUG_CONSOLE_LOG'});
port.onMessage.addListener(function(message) {
  if(!console) return;
  switch(message.type) {
    case 'log':
      console.log(message.message);
      break;
    case 'info':
      console.info(message.message);
      break;
    case 'warn':
      console.warn(message.message);
      break;
    case 'error':
      console.error(message.message);
      break;
    case 'debug':
      console.debug(message.message);
      break;
    default:
      console.log(message.message);
      break;
  }
});
$(window).on('unload', port.disconnect);
