var ImageUpload = {
  init: function() {
    this.progressEl = $('#upload_progress');
    this.loadingEl = $('#loading');
    this.inputEl = document.getElementById('image_input');

    if(ThemeManager.isPopup && !(/^Win/i.test(navigator.platform))) {
      $('#upload_button_area').html(chrome.i18n.getMessage('detach_window_for_upload'));
    }

    var running = UploadManager.registerCallbacks(
      (function(self) {
        return function (success, urlOrError) {
          return self.onFinish(success, urlOrError);
        };
      })(this),
      (function(self) {
        return function (loaded, total) {
          return self.onProgress(loaded, total);
        };
      })(this)
    );
    if(running) {
      this.inputEl.disabled = true;
      this.progressEl.show();
      this.loadingEl.show();
    }
  },

  upload: function() {
    this.inputEl.disabled = true;
    this.progressEl.show();
    this.loadingEl.show();

    var files = this.inputEl.files;
    UploadManager.upload(files[0]);
  },

  onFinish: function(success, urlOrError) {
    if(!window) {
      return false;
    }
    this.inputEl.disabled = false;
    this.progressEl.hide();
    this.loadingEl.hide();
    if(success) {
      this.inputEl.value = null;
      Composer.addText(urlOrError);
    } else {
      Renderer.showError(urlOrError, ImageUpload.upload.bind(ImageUpload));
    }
    return true;
  },

  onProgress: function(loaded, total) {
    if(!window) {
      return false;
    }
    var progress = (loaded / total) * 100.0;
    this.progressEl[0].value = progress;
    return true;
  }
};
