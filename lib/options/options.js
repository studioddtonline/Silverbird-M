"use strict";
class Options {
  constructor(OptionsBackend) {
    if(!OptionsBackend) {
      throw new TypeError("missing OptionsBackend");
    }
    Object.defineProperties(this, {
      "optionsMap": {
        value: {},
        writable: true
      },
      "onloadCallback": {
        value: null,
        writable: true
      },
      "onsaveCallback": {
        value: null,
        writable: true
      },
      "onsaveChangedOptionCallback": {
        value: null,
        writable: true
      },
      "waitingRestartConfirmation": {
        value: false,
        writable: true
      },
      "backend": {
        value: OptionsBackend
      }
    });
  }
  onload(callback) {
    this.onloadCallback = callback;
  }
  onsave(callback) {
    this.onsaveCallback = callback;
  }
  onsaveChangedOption(callback) {
    this.onsaveChangedOptionCallback = callback;
  }
  load(forceDefault) {
    this.optionsMap = this.backend.load(!!forceDefault);
    Array.prototype.slice.call(document.querySelectorAll("input, select, .color_selector")).forEach((entry, index, array) => {
      const name = entry.name || entry.getAttribute("name");
      const value = this.optionsMap[name];
      if(typeof value === "undefined") {
        return;
      }
      const type = entry.type;
      const converter = entry.getAttribute("converter");
      if(!!converter) {
        entry.value = Converters[converter].load(value);
      } else if(type === "checkbox") {
        entry.checked = value || false;
      } else if(type === "radio") {
        entry.checked = value === entry.value;
      } else if(entry.classList.contains("color_selector")) {
        const $entry = $(entry);
        $entry.attr("strColor", value);
        $entry.ColorPickerSetColor(value);
        $entry.css("backgroundColor", value);
      } else {
        entry.value = value;
      }
    })
    if(this.onloadCallback) {
      this.onloadCallback();
    }
  }
  loadDefaults() {
    tweetManager.popupWindowSize = null;
    this.load(true);
    this.waitingRestartConfirmation = true;
    this.save();
  }
  save() {
    this.clearErrors();
    let hasErrors = false;
    Array.prototype.slice.call(document.querySelectorAll("input, select")).forEach((entry, index, array) => {
      const validators = entry.getAttribute("validator");
      if(!validators) {
        return;
      }
      validators.split(",").forEach((validator, index, array) => {
        const validatorEntity = Validator[validator];
        if(!!validatorEntity) {
          try {
            validatorEntity(entry);
          } catch(e) {
            hasErrors = true;
            this.addValidationError(entry, e);
          }
        } else {
          throw new ReferenceError(`missing validator: ${entry}`);
        }
      });
    })
    try {
      Validator.global();
    } catch(e) {
      hasErrors = true;
      this.addValidationError(null, e);
    }
    if(hasErrors) {
      return;
    }
    let askForRestart = false;
    Array.prototype.slice.call(document.querySelectorAll("input, select, .color_selector")).forEach((entry, index, array) => {
      const name = entry.name || entry.getAttribute("name");
      const value = this.optionsMap[name];
      if(typeof value === "undefined") {
        return;
      }
      const converter = entry.getAttribute("converter");
      let newValue = null;
      if(converter) {
        newValue = Converters[converter].save(entry.value);
      } else if(entry.type === "checkbox") {
        newValue = entry.checked;
      } else if(entry.type === "radio") {
        if(!entry.checked) {
          return;
        }
        newValue = entry.value;
      } else if(entry.classList.contains("color_selector")) {
        newValue = entry.getAttribute("strColor");
      } else {
        const intValue = parseInt(entry.value, 10);
        if(intValue == entry.value) { // lazy matching
          newValue = intValue;
        } else {
          newValue = entry.value;
        }
      }
      const oldValue = this.optionsMap[name];
      if(newValue !== oldValue) {
        if(typeof entry.getAttribute("must_restart") !== "undefined") {
          askForRestart = true;
        }
        if(this.onsaveChangedOptionCallback) {
          this.onsaveChangedOptionCallback(name, oldValue, newValue);
        }
        this.optionsMap[name] = newValue;
      }
    });
    this.backend.save(this.optionsMap);
    TimelineTemplate.reloadOptions();
    if(askForRestart || this.waitingRestartConfirmation) {
      this.waitingRestartConfirmation = true;
      $("#restart_notice").modal("show");
      return;
    }
    $("#saved_notice").modal("show");
    if(this.onsaveCallback) {
      this.onsaveCallback();
    }
  }
  confirmRestart() {
   tweetManager.restart();
  }
  addValidationError(element, error) {
    const errorEl = $("<span>").attr("class", "error").text(error);
    const $el = $(element);
    if($el) {
      $el.after(errorEl);
    } else {
      $("#buttons_area").before(errorEl);
    }
  }
  clearErrors() {
    $(".error").remove();
  }
}
