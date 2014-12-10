var AnyClick = {
  callbackCache: new Map(),
  clickBlockCache: new WeakMap(),
  mouseDownCache: new WeakMap(),
  initialized: false,
  clearEventListeners: function() {
    for(var el of AnyClick.callbackCache.keys()) {
      $(el).off('.anyClick');
    }
  },
  clearAllEventListeners: function() {
    AnyClick.clearEventListeners();
    for(var el of AnyClick.callbackCache.keys()) {
      el.removeEventListener('mousedown', AnyClick.mouseDownCache.get(el), true);
      el.removeEventListener('click', AnyClick.clickBlockCache.get(el), true);
      el.removeEventListener('contextmenu', AnyClick.clickBlockCache.get(el), true);
    }
    $(document).off('.anyClick');
    AnyClick.callbackCache.clear();
  },
  anyClick: function(el, clickCallback) {
    AnyClick.callbackCache.set(el, clickCallback);
    AnyClick.clickBlockCache.set(el, AnyClick.clickBlock);
    el.addEventListener('contextmenu', AnyClick.clickBlockCache.get(el), true);
    el.addEventListener('click', AnyClick.clickBlockCache.get(el), true);
    AnyClick.mouseDownCache.set(el, AnyClick.mouseDown.bind(el));
    el.addEventListener('mousedown', AnyClick.mouseDownCache.get(el), true);
  },
  clickBlock: function(event) {
    if(event.which !== 3) {
      event.preventDefault();
    }
  },
  mouseDown: function(event) {
    $(this).on('mouseup.anyClick', AnyClick.mouseUp.bind(this));
  },
  mouseUp: function(event) {
    event.preventDefault();
    event.isAlternateClick = (event.which == 2) || event.metaKey || event.ctrlKey;
    if(AnyClick.callbackCache.has(this)) {
      (AnyClick.callbackCache.get(this))(event);
    }
    $(this).off('.anyClick');
  }
};

// JQuery Helper
(function($) {
  $.fn.anyClick = function(callback) {
    if(!AnyClick.initialized) {
      $(document).on('mouseup.anyClick', AnyClick.clearEventListeners);
      AnyClick.initialized = true;
    }
    return this.each(function() {
      AnyClick.anyClick(this, callback);
    });
  };
})(jQuery);
