function asap (fn, v) {
  setTimeout(function () {
    fn(v)
  }, 0)
}

function isFunction (fn) {
  return typeof fn === 'function'
}

function chainingCycleError () {
  return new TypeError('Chaining cycle detected for promise')
}

function isObject (x) {
  return typeof x === 'object' && x !== null
}

function isThenable (x) {
  if (x == null) return false
  if (typeof x === 'object' || typeof x === 'function') {
    if (typeof x.then === 'function') return true
  }
  return false
}

let id = 0

function Promise (resolver) {
  /*
   * Promise 的状态转移应该是同步的, 但是 then 里面被调用应该是异步的
   */
  this.value = undefined
  this.status = 'pending'
  this.reason = undefined
  this.id = id++ // for debug

  this.resolvedCallbackSubscribes = []
  this.rejectedCallbackSubscribes = []
  
  var self = this

  var resolve = function resolve (value) {
    if (self.status === 'pending') {
      self.status = 'resolved' // 改变状态是同步
      self.value = value
      for (var i = 0; i < self.resolvedCallbackSubscribes.length; ++i) {
        asap(self.resolvedCallbackSubscribes[i], value)
      }
      self.resolvedCallbackSubscribes.length = 0
    }
  }

  var reject = function reject (reason) {
    if (self.status === 'pending') {
      self.status = 'rejected' // 改变状态是同步
      self.reason = reason
      for (var i = 0; i < self.rejectedCallbackSubscribes.length; ++i) {
        asap(self.rejectedCallbackSubscribes[i], reason)
      }
      self.rejectedCallbackSubscribes.length = 0
    }
  }
  
  try {
    resolver(resolve, reject)
  } catch (e) {
    reject(e)
  }
}

Promise.prototype.then = function (onResolved, onRejected) {
  onResolved = isFunction(onResolved) ? onResolved : function (v) { return v }
  onRejected = isFunction(onRejected) ? onRejected : function (r) { throw r }

  var p // new Promise to be returned
  var self = this
  
  if (self.status === 'resolved') {
    return p = new Promise(function (resolve, reject) {
      asap(function () {
        try {
          /*
          * if this new Promise is resolved, onResolved need to be invoked
          * for example:
          *   var p = new Promise(res => res())
          *   p.then(onResolved)
          * onResolved need to be invoked immediately async
          */
          var value = onResolved(self/* self is the original Promise */.value)
          /*
          * 如果第一个 Promise 返回值是一个 Promise
          * for example:
          *   var p = new Promise(res1 => 
          *     res1(new Promise(res2 =>
          *       res2()
          *     )
          *   )
          */
          Promise['[[Resolve]]'](p, value, resolve, reject)
        } catch (e) {
          /*
          * if exception is raised in the process of onResolved execution
          * this new Promise need to be rejected
          */
          reject(e)
        }
      })
    })
  }

  if (self.status === 'rejected') {
    return p = new Promise(function (resolve, reject) {
      asap(function () {
        try {
          var reason = onRejected(self.reason)
          Promise['[[Resolve]]'](p, reason, resolve, reject)
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  if (self.status === 'pending') {
    return p = new Promise(function (resolve, reject) {
      self.resolvedCallbackSubscribes.push(function (value) {
        try {
          /*
           * new Promise(res => {
           *   setTimeout(() => res(), 0)
           * }).then()
           */
          var value = onResolved(self.value)
          /*
           * the status of original promise is changed in its resolver
           * here the new promise p's status is changed
           */
          Promise['[[Resolve]]'](p, value, resolve, reject)
        } catch (e) {
          reject(e)
        }
      })

      self.rejectedCallbackSubscribes.push(function (reason) {
        try {
          var reason = onRejected(self.reason)
          Promise['[[Resolve]]'](p, reason, resolve, reject)
        } catch (e) {
          reject(e)
        }
      })

    })
  }
}

Promise['[[Resolve]]'] = function (promise, x, resolvePromise, rejectPromise) {
  if (promise === x) rejectPromise(chainingCycleError())
  if (isFunction(x) || isObject(x)) {
    try {
      // 2.3.3.1
      var then = x.then
    } catch (e) {
      // 2.3.3.2
      asap(rejectPromise, e)
    }
    // 2.3.3.3
    if (typeof then === 'function') {
      var resolvePromiseIsCalled = false
      var rejectPromiseIsCalled = false
      try {
        then.call(x, y => {
          // console.log('thenable called', y)
          // 2.3.3.3.1
          // 2.3.3.3.3
          if (!resolvePromiseIsCalled && !rejectPromiseIsCalled) {
            asap(function () {
              Promise['[[Resolve]]'](promise, y, resolvePromise, rejectPromise)
            })
            resolvePromiseIsCalled = true
          }
        }, r => {
          // 2.3.3.3.2
          // 2.3.3.3.3
          if (!resolvePromiseIsCalled && !rejectPromiseIsCalled) {
            asap(rejectPromise, r)
            rejectPromiseIsCalled = true
          }
        })
      } catch (e) { // 2.3.3.3.4
        if (!resolvePromiseIsCalled && !rejectPromiseIsCalled) {
          // 2.3.3.3.4.1
          // 2.3.3.3.4.2
          asap(rejectPromise, e)
        }
      }
    } else {
      // 2.3.3.4
      asap(resolvePromise, x)
    }
  } else {
    // 2.3.4
    asap(resolvePromise, x)
  }
}

exports.deferred = function () {
  var deferred = {}
  deferred.promise = new Promise(function (res, rej) {
    deferred.resolve = res
    deferred.reject = rej
  })
  return deferred
}

exports.Promise = Promise