import {type StoryContext} from '@storybook/react-webpack5';
import {userEvent, waitFor} from 'storybook/test';

// Set by UI Verify on every capture, see https://uiverify.ai/docs/is-ui-verify
export const isUIVerify = () => navigator.userAgent.includes('UIVerify') || '__UI_VERIFY__' in window;

type Selector = string | string[];

type ScreenshotAction =
  | {type: 'capture'; selector?: Selector}
  | {type: 'click' | 'focus' | 'mouseMove'; selector: string}
  | {type: 'mouseEvent'; selector: string; eventname: string}
  | {type: 'keys'; value: string}
  | {type: 'sendKeys'; selector: string; value: string}
  | {type: 'scroll'; selector: string; x?: number; y?: number}
  | {type: 'wait'; delay: number}
  | {type: 'waitForElementToShow'; selector: string; timeout?: number; hidden?: boolean};

interface ScreenshotParameters {
  captureSelector?: Selector;
  actions?: ScreenshotAction[];
}

const ROOT_SELECTOR = '#storybook-root';
const TIMEOUT = 2000;

function query(selector: string) {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`No element matches ${selector}`);
  }
  return element;
}

// Like a WebDriver click or hover, act on whatever is painted at the element's center
function atCenter(selector: string) {
  const element = query(selector);
  const {left, top, width, height} = element.getBoundingClientRect();
  return document.elementFromPoint(left + width / 2, top + height / 2) ?? element;
}

// WebDriver actions arrive a round trip apart, and the list handles at most one arrow key per frame
const nextFrame = () => new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve)));

// combokeys, which drives the list's keyboard navigation, reads the legacy keyCode
const KEY_CODES: Record<string, number> = {ArrowDown: 40, ArrowUp: 38, Enter: 13, Escape: 27};

function pressKey(key: string) {
  const target = document.activeElement ?? document.body;
  const keyCode = KEY_CODES[key];
  for (const type of ['keydown', 'keyup']) {
    target.dispatchEvent(
      new KeyboardEvent(type, {key, code: key, keyCode, which: keyCode, bubbles: true, cancelable: true}),
    );
  }
}

const isShown = (selector: string) => document.querySelector(selector)?.checkVisibility() ?? false;

function run(action: ScreenshotAction): unknown {
  switch (action.type) {
    case 'click':
      return userEvent.click(atCenter(action.selector));
    case 'focus':
      return query(action.selector).focus();
    case 'mouseMove':
      return userEvent.hover(atCenter(action.selector));
    case 'mouseEvent':
      return query(action.selector).dispatchEvent(new MouseEvent(action.eventname));
    case 'keys':
      return action.value === 'Tab' ? userEvent.tab() : pressKey(action.value);
    case 'sendKeys':
      return userEvent.type(query(action.selector), action.value);
    case 'scroll': {
      const element = query(action.selector);
      element.scrollTop += action.y ?? 0;
      element.scrollLeft += action.x ?? 0;
      return undefined;
    }
    case 'wait':
      return new Promise(resolve => setTimeout(resolve, action.delay));
    case 'waitForElementToShow':
      return waitFor(
        () => {
          if (isShown(action.selector) === Boolean(action.hidden)) {
            throw new Error(`${action.selector} is ${action.hidden ? 'still shown' : 'not shown'}`);
          }
        },
        {timeout: action.timeout ?? TIMEOUT},
      );
    default:
      return undefined;
  }
}

/**
 * Brings the story to the state the Testplane suite captures (`parameters.screenshots`), so UI Verify
 * screenshots the same thing. UI Verify shoots `#storybook-root`, or the viewport when the root has no
 * box, so a capture target rendered outside the root or in the top layer (a popup, a dialog) gets the viewport.
 */
export async function playScreenshotActions({parameters}: StoryContext) {
  if (!isUIVerify()) {
    return;
  }
  const {captureSelector = ROOT_SELECTOR, actions = []}: ScreenshotParameters = parameters.screenshots ?? {};

  const lastCapture = actions.findLastIndex(action => action.type === 'capture');
  for (const action of actions.slice(0, lastCapture === -1 ? actions.length : lastCapture)) {
    await run(action);
    await nextFrame();
  }

  const capture = actions[lastCapture];
  const selector = (capture?.type === 'capture' && capture.selector) || captureSelector;
  const selectors = Array.isArray(selector) ? selector : [selector];
  await waitFor(() => selectors.forEach(query), {timeout: TIMEOUT});

  const root = query(ROOT_SELECTOR);
  const isOverlay = (element: HTMLElement) => !root.contains(element) || element.closest(':modal, :popover-open');
  if (selectors.some(it => isOverlay(query(it)))) {
    root.style.display = 'contents';
  }
}
