'use strict';

SwaggerEditor.service('Backend', function Backend($http, $q, $location, defaults,
  $rootScope, Builder, ExternalHooks, YAML) {

  var changeListeners =  {};
  var absoluteRegex = /^(\/|http(s)?\:\/\/)/; // starts with slash or http|https
  var buffer = {};
  var throttleTimeout = defaults.backendThrottle || 200;
  var commit = _.throttle(commitNow, throttleTimeout, {
    leading: false,
    trailing: true
  });

  // Using the 'backend' query parameter as the backend URL, if given

  var backend = $location.search().backend;
  var backendEndpoint;
  if (backend) {
    backendEndpoint = backend;
  }
  else {
    backendEndpoint = defaults.backendEndpoint;
  }

  // if backendEndpoint is not absolute append it to location.pathname
  if (!absoluteRegex.test(backendEndpoint)) {
    var pathname = _.endsWith(location.pathname, '/') ? location.pathname :
      location.pathname + '/';
    backendEndpoint = pathname + defaults.backendEndpoint;

    // avoid double slash that might generated by appending location.href to
    // backendEndpoint
    backendEndpoint = backendEndpoint.replace('//', '/');
  }

  /*
   *
  */
  function commitNow(data) {
    var result = Builder.buildDocs(data, { resolve: true });

    save('progress', 'progress-saving');

    var httpConfig = {
      headers: {
        'content-type': defaults.useYamlBackend ?
          'application/yaml; charset=utf-8' : 'application/json; charset=utf-8'
      }
    };

    if (!result.error) {
      $http.put(backendEndpoint, data, httpConfig)
        .then(function success() {
          ExternalHooks.trigger('put-success', [].slice.call(arguments));
          $rootScope.progressStatus = 'success-saved';
        }, function failure() {
          ExternalHooks.trigger('put-failure', [].slice.call(arguments));
          $rootScope.progressStatus = 'error-connection';
        });
    }
  }

  /*
   *
  */
  function save(key, value) {

    // Save values in a buffer
    buffer[key] = value;

    if (Array.isArray(changeListeners[key])) {
      changeListeners[key].forEach(function (fn) {
        fn(value);
      });
    }

    if (key === 'yaml' && value) {
      if (defaults.useYamlBackend) {
        commit(value);
      } else {
        YAML.load(value, function (err, json) {
          if (!err) { commit(json); }
        });
      }
    }
  }

  /*
   *
  */
  function load(key) {
    if (key !== 'yaml') {
      return new Promise(function (resolve, reject) {
        if (!key) {
          reject();
        } else {
          resolve(buffer[key]);
        }
      });
    }

    var httpConfig = {
      headers: {
        accept: defaults.useYamlBackend ?
          'application/yaml; charset=utf-8' : 'application/json; charset=utf-8'
      }
    };

    return $http.get(backendEndpoint, httpConfig)
      .then(function (res) {
        if (defaults.useYamlBackend) {
          buffer.yaml = res.data;
          return buffer.yaml;
        }
        return res.data;
      }).then(function(data) {
        return new Promise(function (resolve, reject) {
          YAML.dump(data, function(err, yaml) {
            resolve(yaml);
          });
        });
      });
  }

  /*
   *
  */
  function addChangeListener(key, fn) {
    if (angular.isFunction(fn)) {
      if (!changeListeners[key]) {
        changeListeners[key] = [];
      }
      changeListeners[key].push(fn);
    }
  }

  /*
   *
  */
  function noop() {}

  this.save = save;
  this.reset = noop;
  this.load = load;
  this.addChangeListener = addChangeListener;
});
