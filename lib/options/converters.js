"use strict";
// require("jquery");
const Converters = class Comverters {
  static get RefreshInterval() {
    return {
      load: ($el, val) => {
        $el.val(val / 1000 | 0);
      },
      save: ($el) => {
        return parseInt($el.val(), 10) * 1000;
      }
    };
  }
}
