"use strict";
// require("jquery");
const Converters = class Comverters {
  static get RefreshInterval() {
    return {
      load: (val) => {
        return (val / 1000 | 0);
      },
      save: (val) => {
        return parseInt(val, 10) * 1000;
      }
    };
  }
}
