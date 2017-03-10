'use strict';

const { handle } = require('./events');
const fs = require('fs');
const fetch = require('node-fetch');
const Headers = require('./Headers');
const path = require('path');
const Request = require('./Request');
const Response = require('./Response');
const ServiceWorker = require('./ServiceWorker');
const ServiceWorkerGlobalScope = require('./ServiceWorkerGlobalScope');
const ServiceWorkerRegistration = require('./ServiceWorkerRegistration');
const vm = require('vm');

const nativeRequire = require;

module.exports = class ServiceWorkerContainer {
  /**
   * Constructor
   * @param {String} parentPath
   */
  constructor (parentPath) {
    this.controller = null;

    this.scope = null;
    this.api = null;
    this._parentPath = parentPath;
    this._registration = null;
    this._sw = null;
  }

  /**
   * Retrieve ServiceWorkerRegistration when active
   * Will trigger install/activate lifecycle
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  get ready () {
    if (this.controller) return Promise.resolve(this._registration);
    return this.trigger('install')
      .then(() => this.trigger('activate'))
      .then(() => this._registration);
  }

  /**
   * Register ServiceWorker script at 'scriptURL'
   * @param {String} scriptURL
   * @param {Object} [options]
   *  - {String} baseURL
   *  - {String} scope
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  register (scriptURL, { baseURL = 'http://127.0.0.1:4000', scope = '/' } = {}) {
    this._registration = new ServiceWorkerRegistration(this, baseURL, scope);
    this._load(scriptURL);
    return Promise.resolve(this._registration);
  }

  /**
   * Retrieve current ServiceWorker registration
   * @param {String} [scope]
   * @returns {Promise<ServiceWorkerRegistration>}
   */
  getRegistration (scope) {
    return Promise.resolve(this._registration);
  }

  /**
   * Retrieve all current ServiceWorker registrations
   * @param {String} [scope]
   * @returns {Promise<Array>}
   */
  getRegistrations () {
    return Promise.resolve([this._registration]);
  }

  /**
   * Trigger 'eventType' in current scope
   * @param {String} eventType
   * @returns {Promise}
   */
  trigger (eventType, ...args) {
    switch (eventType) {
      case 'install':
        this._setState('installing');
        break;
      case 'activate':
        this._setState('activating');
        break;
      case 'fetch':
        this._setState('fetching');
        break;
    }

    const done = () => {
      switch (eventType) {
        case 'install':
          this._setState('installed');
          break;
        case 'activate':
          this._setState('activated');
          break;
      }
    };

    if (this.scope._listeners[eventType]) {
      return handle(this.scope._listeners, eventType, ...args)
        .then((result) => {
          done();
          return result;
        });
    }

    done();

    return Promise.resolve();
  }

  /**
   * Load and execute script at 'scriptURL'
   * @param {String} scriptURL
   */
  _load (scriptURL) {
    const isPath = !~scriptURL.indexOf('\n');
    const contextpath = isPath ? getResolvedPath(this._parentPath, scriptURL) : this._parentPath;
    const script = isPath
      ? fs.readFileSync(isRelativePath(scriptURL) ? path.resolve(this._parentPath, scriptURL) : scriptURL, 'utf8')
      : scriptURL;
    const scriptModule = { exports: {} };
    const globalScope = new ServiceWorkerGlobalScope(this._registration);
    const sandbox = vm.createContext(Object.assign(globalScope, {
      console,
      fetch,
      Request,
      Response,
      Headers,
      module: scriptModule,
      exports: scriptModule.exports,
      process,
      setTimeout,
      self: globalScope,
      require: getRequire(contextpath)
    }));

    vm.runInContext(script, sandbox);

    this._sw = new ServiceWorker(contextpath);
    this.api = scriptModule.exports;
    this.scope = sandbox;
  }

  /**
   * Store 'state'
   * @param {String} state
   */
  _setState (state) {
    switch (state) {
      case 'installing':
        if (this._sw.state != state) throw Error('ServiceWorker already installed');
        this._registration.installing = this._sw;
        this.controller = null;
        break;
      case 'installed':
        this._sw.state = state;
        this._registration.installing = null;
        this._registration.waiting = this._sw;
        break;
      case 'activating':
        if (this._sw.state != 'installed') throw Error('ServiceWorker not yet installed');
        this._sw.state = state;
        this._registration.activating = this._sw;
        this.controller = null;
        break;
      case 'activated':
        this._sw.state = state;
        this._registration.waiting = null;
        this._registration.active = this._sw;
        this.controller = this._sw;
        break;
      case 'fetching':
        if (this._sw.state != 'activated') throw Error('ServiceWorker not yet active');
        break;
    }
  }

  _destroy () {
    this.scope._destroy();
    this.scope = null;
  }
};


/**
 * Retrieve 'require' function for 'contextpath'
 * @param {String} contextpath
 * @returns {Function}
 */
function getRequire (contextpath) {
  const r = function require (requiredpath) {
    return nativeRequire(getResolvedPath(contextpath, requiredpath));
  };

  r.resolve = function resolve (requiredpath) {
    return nativeRequire.resolve(getResolvedPath(contextpath, requiredpath));
  };

  return r;
}

/**
 * Retrieve the fully resolved path
 * @param {String} contextpath
 * @param {String} p
 * @returns {String}
 */
function getResolvedPath (contextpath, p) {
  return isRelativePath(p)
    ? path.resolve(contextpath, p)
    : p;
}

/**
 * Determine if 'p' is relative path
 * @param {String} p
 * @returns {Boolean}
 */
function isRelativePath (p) {
  return p.indexOf('.') == 0;
}