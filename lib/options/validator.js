"use strict";
// require("jquery");
const Validator = class Validator {
  static global() {
    let atLeastOneVisible = false;
    Array.prototype.slice.call(document.querySelectorAll(`input[type="checkbox"]`)).forEach((entry, index, array) => {
      if(/_visible$/.test(entry.name) && entry.checked) {
        atLeastOneVisible = true;
      }
    })
    if(!atLeastOneVisible) {
      document.querySelector(`input[name="home_visible"]`).checked = true;
    }
    return true;
  }

  static required (element) {
    const value = element.value;
    if(!value || value === "") {
      throw new TypeError("It can't be empty.");
    }
    return true;
  }

  static number (element) {
    const value = element.value;
    if(isNaN(parseInt(value, 10))) {
      throw new TypeError("It should be a number.");
    }
    return true;
  }

  static positive (element) {
    const value = element.value;
    if(parseInt(value, 10) <= 0) {
      throw new TypeError("It should be positive.");
    }
    return true;
  }

  static minRefresh (element) {
    const value = element.value;
    if(parseInt(value, 10) < 90) {
      throw new TypeError("Minimum interval is 90s");
    }
    return true;
  }

  static unifiedValidator(element) {
    if(!element.checked) {
      return true;
    }
    let atLeastOneSelected = false;
    Array.prototype.slice.call(document.querySelectorAll(`input[type="checkbox"]`)).forEach((entry, index, array) => {
      if(/include_unified$/.test(entry.name) && entry.checked) {
        atLeastOneSelected = true;
      }
    })
    if(!atLeastOneSelected) {
      document.querySelector(`input[name="notification_include_unified"]`).checked = true;
    }
    return true;
  }
}
