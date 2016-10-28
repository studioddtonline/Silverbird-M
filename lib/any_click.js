const AnyClick = {
  clearEventListeners: function() {
    document.querySelectorAll(`.inner_timeline a`).forEach((anchor) => {
      if(!anchor.anyClick) {
        return;
      }
      anchor.removeEventListener("contextmenu", anchor.anyClick.clickBlock, {capture: true});
      anchor.removeEventListener("click", anchor.anyClick.clickBlock, {capture: true});
      anchor.removeEventListener("auxclick", anchor.anyClick.clickBlock, {capture: true});
      anchor.removeEventListener("mousedown", anchor.anyClick.mouseDown, {capture: true});
      anchor.anyClick = null;
    });
  },
  anyClick: function(el, clickCallback = new Function()) {
    if(!el.hasOwnProperty("anyClick")) {
      Object.defineProperty(el, "anyClick", {
        value: ((el) => {
          return {
            callback: clickCallback,
            clickBlock: (event) => {
              event.preventDefault();
              event.stopPropagation();
            },
            mouseDown: (event) => {
              event.target.addEventListener("mouseup", el.anyClick.mouseUp);
            },
            mouseUp: (event) => {
              event.preventDefault();
              event.isAlternateClick = (event.button === 1) || event.metaKey || event.ctrlKey;
              el.anyClick.callback(event);
              event.target.removeEventListener("mouseup", el.anyClick.mouseUp);
            }
          };
        })(el),
        writable: true
      });
      el.addEventListener("contextmenu", el.anyClick.clickBlock, {capture: true});
      el.addEventListener("click", el.anyClick.clickBlock, {capture: true});
      el.addEventListener("auxclick", el.anyClick.clickBlock, {capture: true});
      el.addEventListener("mousedown", el.anyClick.mouseDown, {capture: true});
    }
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
