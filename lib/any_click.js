var AnyClick = {
  waitingUp: [],
  cleanUp: [],
  initiated: false,
  init: function(options) {
    this.initiated = true;
    $(document).on('mouseup', function() {
      AnyClick.clearEventListeners();
    });
  },
  clearEventListeners: function() {
    for(var i = 0, len = this.waitingUp.length; i < len; ++i) {
      var el = this.waitingUp[i].element;
      el.removeEventListener(this.waitingUp[i].event, this.waitingUp[i].listener, true);
      this.waitingUp[i] = null;
    }
    if(len > 0) {
      this.waitingUp = [];
    }
  },
  clearAllEventListeners: function() {
    this.clearEventListeners();
    for(var i = 0, len = this.cleanUp.length; i < len; ++i) {
      var el = this.cleanUp[i].element;
      el.removeEventListener(this.cleanUp[i].event, this.cleanUp[i].listener, true);
      this.cleanUp[i] = null;
    }
    if(len > 0) {
      this.cleanUp = [];
    }
  },
  anyClick: function(el, clickCallback) {
    if(!this.initiated) {
      this.init();
    }
    el.addEventListener('click', function(event) {
      if(event.button != 2) {
        event.preventDefault();
      }
      AnyClick.cleanUp.push({element: this, listener: arguments.callee, event: 'click'});
    }, true);
    el.addEventListener('mousedown', function() {
      var listener = function(event) {
        event.preventDefault();
        event.isAlternateClick = event.button == 1 || event.metaKey || event.ctrlKey;
        clickCallback(event);
        AnyClick.clearEventListeners();
      };
      AnyClick.waitingUp.push({element: this, listener: listener, event: 'mouseup'});
      el.addEventListener('mouseup', listener, true);
      AnyClick.cleanUp.push({element: this, listener: arguments.callee, event: 'mousedown'});
    }, true);
  }
};

// JQuery Helper
(function($) {
  $.fn.anyClick = function(callback) {
    return this.each(function() {
      AnyClick.anyClick(this, callback);
    });
  };
})(jQuery);