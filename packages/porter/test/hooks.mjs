import sinon from 'sinon';

export const mochaHooks = {
  beforeEach() {
    if (this.sinon) {
      this.sinon.restore();
    } else {
      this.sinon = sinon.createSandbox();
    }
  },
};
