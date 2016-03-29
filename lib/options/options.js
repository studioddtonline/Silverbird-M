function Options() {
  this.optionsMap = {};
  this.onloadCallback = null;
  this.onsaveCallback = null;
  this.onsaveChangedOptionCallback = null;
  this.waitingRestartConfirmation = false;

  this.onload = function(callback) {
    this.onloadCallback = callback;
  };

  this.onsave = function(callback) {
    this.onsaveCallback = callback;
  };

  this.onsaveChangedOption = function(callback) {
    this.onsaveChangedOptionCallback = callback;
  };

  this.load = function(forceDefault) {
    this.optionsMap = OptionsBackend.load(forceDefault);
    $('input,select,.color_selector').each((function(self) {
      return function() {
        var $this = $(this), name = $this.attr('name');
        if(name) {
          var converter = $this.attr('converter');
          if(converter) {
            Converters[converter].load($this, self.optionsMap[name]);
          } else if($this.is('[type="checkbox"]')) {
            $this.attr('checked', self.optionsMap[name]);
          } else if($this.is('[type="radio"]')) {
            if(self.optionsMap[name] == $this.val()) {
              $this.attr('checked', true);
            }
          } else if($this.is('.color_selector')) {
            $this.attr('strColor', self.optionsMap[name]);
            $this.ColorPickerSetColor(self.optionsMap[name]);
            $this.css('backgroundColor', self.optionsMap[name]);
          } else {
            $this.val(self.optionsMap[name]);
          }
        }
      };
    })(this));
    if(this.onloadCallback) this.onloadCallback();
  };

  this.loadDefaults = function() {
    Persistence.popupSize().remove();
    this.load(true);
    this.save();
  };

  this.save = function() {
    this.clearErrors();
    var hasErrors = false;
    $('input,select').each((function(self) {
      return function() {
        var $this = $(this), validator = $this.attr('validator');
        if(validator) {
          var validatorsArray = validator.split(',');
          for(var i = 0, len = validatorsArray.length; i < len; ++i) {
            var validInfo = Validator[validatorsArray[i]]($this);
            if(validInfo !== true) {
              hasErrors = true;
              self.addValidationError($this, validInfo);
              return true;
            }
          }
        }
        return true;
      };
    })(this));
    var validInfo = Validator.global();
    if(validInfo !== true) {
      hasErrors = true;
      this.addValidationError(null, validInfo);
    }
    if(!hasErrors) {
      var askForRestart = false;
      $('input,select,.color_selector').each((function(self) {
        return function() {
          var $this = $(this), name = $this.attr('name');
          if(name) {
            var converter = $this.attr('converter'), newValue = null;
            if(converter) {
              newValue = Converters[converter].save($this);
            } else if($this.is('[type="checkbox"]')) {
              newValue = $this.is(':checked');
            } else if($this.is('[type="radio"]')) {
              if(!$this.is(':checked')) {
                return true;
              }
              newValue = $this.val();
            } else if($this.is('.color_selector')) {
              newValue = $this.attr('strColor');
            } else {
              var elValue = $this.val(), intValue = parseInt(elValue, 10);
              if(intValue == elValue) {
                elValue = intValue;
              }
              newValue = elValue;
            }
            var oldValue = self.optionsMap[name];
            if(oldValue != newValue) {
              if($this.attr('must_restart') !== undefined) {
                askForRestart = true;
              }
              if(self.onsaveChangedOptionCallback) {
                self.onsaveChangedOptionCallback(name, oldValue, newValue);
              }
              self.optionsMap[name] = newValue;
            }
          }
          return true;
        };
      })(this));
      OptionsBackend.save(this.optionsMap);
      TimelineTemplate.reloadOptions();
      askForRestart = askForRestart || this.waitingRestartConfirmation;
      if(askForRestart) {
        this.waitingRestartConfirmation = true;
        $("#restart_notice").modal('show');
        return;
      }
      $("#saved_notice").modal('show');
      if(this.onsaveCallback) {
        this.onsaveCallback();
      }
    }
  };

  this.confirmRestart = function() {
    backgroundPage.TweetManager.instance.restart();
  };

  this.addValidationError = function($el, error) {
    var errorEl = $("<span>").attr('class', 'error').text(error);
    if($el) {
      $el.after(errorEl);
    } else {
      $("#buttons_area").before(errorEl);
    }
  };

  this.clearErrors = function() {
    $('.error').remove();
  };

}
