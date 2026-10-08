export const shellBus = new EventTarget();
export const focusAddressBar = () => shellBus.dispatchEvent(new Event('focus-address'));
