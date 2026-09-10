/* Phoenix Industrial Labs — contact form helpers.
   Pure functions, no DOM. Loaded in the page as window.PILForm and in Node via require(). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PILForm = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function clean(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function validEmail(s) {
    var v = clean(s);
    return v.length <= 254 && EMAIL.test(v);
  }

  function validName(s) { return clean(s).length >= 1; }

  /* Returns {ok, errors:{name?,email?}} */
  function validate(fields) {
    var errors = {};
    if (!validName(fields.name)) errors.name = 'Add your name.';
    if (!validEmail(fields.email)) errors.email = 'Add a working email address.';
    return { ok: Object.keys(errors).length === 0, errors: errors };
  }

  function firstName(s) { return clean(s).split(' ')[0]; }

  /* Body for a Google Form (entry.N fields) or any generic endpoint. */
  function buildBody(config, fields) {
    var p = new URLSearchParams();
    p.set(config.nameField || 'name', clean(fields.name));
    p.set(config.emailField || 'email', clean(fields.email));
    if (config.sourceField) p.set(config.sourceField, config.source || '');
    else if (!config.nameField) p.set('source', config.source || '');
    return p.toString();
  }

  function buildMailto(to, fields, source) {
    var n = clean(fields.name), e = clean(fields.email);
    var subject = 'Walkthrough request from ' + n;
    var text = 'Name: ' + n + '\nEmail: ' + e + (source ? '\nSource: ' + source : '');
    return 'mailto:' + to + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(text);
  }

  return { clean: clean, validEmail: validEmail, validName: validName, validate: validate,
           firstName: firstName, buildBody: buildBody, buildMailto: buildMailto };
});
