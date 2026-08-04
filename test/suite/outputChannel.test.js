const assert = require('assert');
const outputChannelModule = require('../../src/outputChannel');
const { write, clear, hide, dispose, writeBadArgs } = outputChannelModule;

suite('outputChannel.js - exports.outputChannel binding fix', () => {

  setup(async () => {
    await outputChannelModule.dispose();
    outputChannelModule.outputChannel = undefined;
  });

  teardown(async () => {
    await outputChannelModule.dispose();
    outputChannelModule.outputChannel = undefined;
  });

  test('write() called as a destructured function still stores its channel on exports.outputChannel', () => {
    assert.strictEqual(outputChannelModule.outputChannel, undefined);
    assert.doesNotThrow(() => write('hello from a destructured write()'));
    // REGRESSION: with the old `this.outputChannel` code, this receiver-less call
    // would have written to the global object instead, leaving exports.outputChannel
    // undefined forever.
    assert.ok(outputChannelModule.outputChannel, 'exports.outputChannel should now be a real OutputChannel');
  });

  test('clear() is a no-op and does not throw when no channel exists yet, called destructured', async () => {
    assert.strictEqual(outputChannelModule.outputChannel, undefined);
    await assert.doesNotReject(() => clear());
  });

  test('clear() called destructured clears the channel created via exports.outputChannel', async () => {
    write('some text to clear');
    assert.ok(outputChannelModule.outputChannel);
    await assert.doesNotReject(() => clear());
  });

  test('hide() called destructured does not throw once a channel exists', async () => {
    write('text to show then hide');
    await assert.doesNotReject(() => hide());
  });

  test('dispose() called destructured does not throw once a channel exists', async () => {
    write('text before dispose');
    await assert.doesNotReject(() => dispose());
  });

  test('writeBadArgs() called destructured lazily creates the channel via exports.outputChannel', async () => {
    const badObject = { badKeys: ['notAKey'], badValues: [{ isRegex: 'yes' }] };
    assert.strictEqual(outputChannelModule.outputChannel, undefined);
    await assert.doesNotReject(() => writeBadArgs(badObject));
    assert.ok(outputChannelModule.outputChannel);
  });
});
