'use client';
import * as React from 'react';
import useLazyRef from '@mui/utils/useLazyRef';

class LazyRipple {
  static create() {
    return new LazyRipple();
  }

  constructor() {
    this.ref = { current: null };
    this.shouldMount = false;
    this.mounted = false;
  }

  mount() {
    if (!this.mounted) {
      this.mounted = createControlledPromise();
      this.shouldMount = true;
      this.setShouldMount(this.shouldMount);
    }
    return this.mounted;
  }

  mountEffect = () => {
    if (this.shouldMount) {
      Promise.resolve().then(() => {
        if (this.ref.current !== null) {
          this.mounted.resolve();
        }
      });
    }
  };

  render() {
    /* eslint-disable */
    const [shouldMount, setShouldMount] = React.useState(false);

    this.shouldMount = shouldMount;
    this.setShouldMount = setShouldMount;

    React.useEffect(this.mountEffect, [shouldMount]);
    /* eslint-enable */
  }

  /* Ripple API */

  start(...args) {
    this.mount().then(() => this.ref.current.start(...args));
  }

  stop(...args) {
    this.mount().then(() => this.ref.current.stop(...args));
  }

  pulsate(...args) {
    this.mount().then(() => this.ref.current.pulsate(...args));
  }
}

export default function useLazyRipple() {
  const ripple = useLazyRef(LazyRipple.create).current;

  ripple.render();

  return ripple;
}

function createControlledPromise() {
  let resolve;
  let reject;

  const p = new Promise((resolveFn, rejectFn) => {
    resolve = resolveFn;
    reject = rejectFn;
  });
  p.resolve = resolve;
  p.reject = reject;

  return p;
}
