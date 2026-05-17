export const MOODLE_BROWSER_LOGIN_SCRIPT = String.raw`
(function () {
  function post(payload) {
    try {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    } catch (_) {}
  }

  function continueFhgrWayfLogin() {
    try {
      var host = window.location.hostname.toLowerCase();
      var hasFhgrWayfControl = document.querySelector("#user_idp") || document.querySelector("[savedvalue='https://aai-login.fhgr.ch/idp/shibboleth']");
      if (
        !hasFhgrWayfControl &&
        host !== "moodle.fhgr.ch" &&
        host.indexOf("switch.ch") === -1 &&
        host.indexOf("eduid.ch") === -1 &&
        host !== "aai-login.fhgr.ch"
      ) {
        return false;
      }

      var select = document.querySelector("#user_idp");
      var form = document.querySelector("form#IdPList") || (select && select.form);
      var submit = document.querySelector("#wayf_submit_button, input[type='submit'], button[type='submit']");
      if (!select || (!form && !submit)) {
        var fhgrChoice = document.querySelector("[savedvalue='https://aai-login.fhgr.ch/idp/shibboleth']");
        if (fhgrChoice && typeof fhgrChoice.click === "function") {
          post({ type: "moodle-login-step", value: "fhgr-wayf" });
          fhgrChoice.click();
          window.setTimeout(function () {
            var nextSubmit = document.querySelector("#wayf_submit_button, input[type='submit'], button[type='submit']");
            if (nextSubmit && typeof nextSubmit.click === "function") {
              nextSubmit.click();
            }
          }, 180);
          return true;
        }
        return false;
      }

      var fhgrIdp = "https://aai-login.fhgr.ch/idp/shibboleth";
      var hasFhgrOption = Array.prototype.some.call(select.options || [], function (option) {
        return option.value === fhgrIdp;
      });
      if (!hasFhgrOption) {
        return false;
      }

      select.value = fhgrIdp;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      post({ type: "moodle-login-step", value: "fhgr-wayf" });
      window.setTimeout(function () {
        if (submit && typeof submit.click === "function") {
          submit.click();
          return;
        }
        if (form && form.action) {
          form.submit();
        }
      }, 120);
      return true;
    } catch (_) {
      return false;
    }
  }

  function scheduleFhgrWayfLogin() {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (continueFhgrWayfLogin() || attempts >= 24) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  function submitFhgrLoginWhenFilled() {
    try {
      var host = window.location.hostname.toLowerCase();
      if (host !== "aai-login.fhgr.ch") {
        return false;
      }

      var password = document.querySelector("input[type='password']");
      var username = document.querySelector("input[name='username'], input[type='text'], input:not([type])");
      if (!username || !password || !username.value || !password.value) {
        return false;
      }

      var submit = document.querySelector("button[type='submit'], input[type='submit'], input[value='Login'], button");
      if (!submit || typeof submit.click !== "function") {
        return false;
      }

      post({ type: "moodle-login-step", value: "fhgr-credentials" });
      submit.click();
      return true;
    } catch (_) {
      return false;
    }
  }

  function scheduleFhgrCredentialSubmit() {
    var attempts = 0;
    var timer = window.setInterval(function () {
      attempts += 1;
      if (submitFhgrLoginWhenFilled() || attempts >= 240) {
        window.clearInterval(timer);
      }
    }, 250);
  }

  if (continueFhgrWayfLogin()) {
    true;
    return;
  }
  scheduleFhgrWayfLogin();
  scheduleFhgrCredentialSubmit();

  if (window.__moodleClientQrCaptureRunning) {
    true;
    return;
  }

  window.__moodleClientQrCaptureRunning = true;
  window.setTimeout(function () {
    window.__moodleClientQrCaptureRunning = false;
  }, 1800);

  function clean(value) {
    return String(value || "")
      .replace(/&amp;/g, "&")
      .replace(/\\u0026/g, "&")
      .trim();
  }

  function normalizeQrValue(value) {
    var candidate = clean(value);
    if (!candidate) {
      return null;
    }

    if (/^moodlemobile:\/\//i.test(candidate)) {
      return candidate;
    }

    try {
      var url = new URL(candidate, window.location.origin);
      if (url.searchParams.get("qrlogin") && url.searchParams.get("userid")) {
        return "moodlemobile://" + url.href;
      }
    } catch (_) {}

    return null;
  }

  function postQr(value, source) {
    var qr = normalizeQrValue(value);
    if (!qr) {
      return false;
    }

    post({ type: "moodle-qr-link", value: qr, source: source });
    return true;
  }

  function findQrInText(value, source) {
    var text = clean(value);
    var mobileMatch = text.match(/moodlemobile:\/\/[^"'<>\\s)]+/i);
    if (mobileMatch && postQr(mobileMatch[0], source)) {
      return true;
    }

    var urlMatch = text.match(/https?:\/\/[^"'<>\\s)]+[?&]qrlogin=[^"'<>\\s)]+/i);
    return Boolean(urlMatch && postQr(urlMatch[0], source));
  }

  function normalizedText(value) {
    return clean(value).replace(/\s+/g, " ").trim().toLowerCase();
  }

  function clickMobileQrButton() {
    if (window.__moodleClientClickedMobileQrButton) {
      return false;
    }

    var clickables = Array.prototype.slice.call(document.querySelectorAll("button, input[type='button'], input[type='submit'], a"));
    for (var index = 0; index < clickables.length; index += 1) {
      var element = clickables[index];
      var label = normalizedText([
        element.innerText,
        element.value,
        element.title,
        element.getAttribute && element.getAttribute("aria-label"),
      ].filter(Boolean).join(" "));
      var asksForQr = /qr-code anzeigen|qr code anzeigen|show qr|qr-code|qr code/.test(label);
      var isMobileAppArea = hasMobileAppAncestor(element);
      if (!asksForQr || !isMobileAppArea) {
        continue;
      }

      window.__moodleClientClickedMobileQrButton = true;
      post({ type: "moodle-login-step", value: "mobile-qr-button" });
      element.click();
      return true;
    }

    return false;
  }

  function hasMobileAppAncestor(element) {
    var current = element;
    for (var depth = 0; current && depth < 8; depth += 1) {
      var text = normalizedText(current.innerText || "");
      if (/mobile app|moodle app|mobilen app|zugriff mit der mobilen app/.test(text)) {
        return true;
      }
      current = current.parentElement;
    }

    return false;
  }

  var attributes = ["href", "src", "data-src", "data-url", "data-link", "data-qr", "data-content", "value"];
  var nodes = Array.prototype.slice.call(document.querySelectorAll("a, img, canvas, input, textarea, [data-qr], [data-url], [data-link], [data-content], script"));
  for (var i = 0; i < nodes.length; i += 1) {
    var node = nodes[i];
    for (var j = 0; j < attributes.length; j += 1) {
      var attributeValue = node.getAttribute && node.getAttribute(attributes[j]);
      if (attributeValue && findQrInText(attributeValue, "attribute:" + attributes[j])) {
        true;
        return;
      }
    }

    if ((node.tagName || "").toLowerCase() === "script" && findQrInText(node.textContent, "script")) {
      true;
      return;
    }
  }

  if (findQrInText(document.body ? document.body.innerText : "", "body")) {
    true;
    return;
  }

  function looksLikeQrElement(element) {
    var text = [
      element.id,
      element.className,
      element.alt,
      element.title,
      element.getAttribute && element.getAttribute("aria-label"),
      element.parentElement && element.parentElement.innerText,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return /qr|moodlemobile|mobile login|mobile app|moodle app/.test(text);
  }

  function isLargeEnoughForQr(element) {
    var width = element.naturalWidth || element.videoWidth || element.width || element.clientWidth;
    var height = element.naturalHeight || element.videoHeight || element.height || element.clientHeight;
    return Number(width) >= 80 && Number(height) >= 80;
  }

  function sendImagePixels(element, source) {
    try {
      var width = element.naturalWidth || element.videoWidth || element.width;
      var height = element.naturalHeight || element.videoHeight || element.height;
      if (!width || !height) {
        return false;
      }

      var maxEdge = 360;
      var scale = Math.min(1, maxEdge / Math.max(width, height));
      var outputWidth = Math.max(1, Math.floor(width * scale));
      var outputHeight = Math.max(1, Math.floor(height * scale));
      var canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;
      var context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        return false;
      }

      context.drawImage(element, 0, 0, outputWidth, outputHeight);
      var image = context.getImageData(0, 0, outputWidth, outputHeight);
      post({
        type: "moodle-qr-image",
        source: source,
        image: {
          width: outputWidth,
          height: outputHeight,
          data: Array.prototype.slice.call(image.data),
        },
      });
      return true;
    } catch (_) {
      return false;
    }
  }

  function scanQrImages() {
    var images = Array.prototype.slice.call(document.querySelectorAll("img, canvas")).filter(function (element) {
      return isLargeEnoughForQr(element) && (looksLikeQrElement(element) || /qr|moodlemobile/i.test(String(element.src || "")));
    });

    for (var k = 0; k < Math.min(images.length, 8); k += 1) {
      var imageElement = images[k];
      if ((imageElement.tagName || "").toLowerCase() === "img" && !imageElement.complete) {
        imageElement.addEventListener("load", function (event) {
          sendImagePixels(event.currentTarget, "image-load");
        }, { once: true });
        continue;
      }

      sendImagePixels(imageElement, "image");
    }

    post({
      type: "moodle-page-scan",
      url: window.location.href,
      title: document.title,
      candidates: images.length,
    });
  }

  var openedQr = clickMobileQrButton();
  scanQrImages();
  if (openedQr) {
    window.setTimeout(scanQrImages, 650);
    window.setTimeout(scanQrImages, 1400);
  }
})(); true;
`;
