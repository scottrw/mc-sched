import {CreateEffectOptions, effect, EffectRef, Injector, ɵChangeDetectionScheduler as ChangeDetectionScheduler, ɵEffectScheduler as EffectScheduler, ɵNotificationSource as NotificationSource,} from '@angular/core';
import {LitElement as LitElementActual, ReactiveElement} from 'lit';

export {computed, signal, type Signal, type WritableSignal} from '@angular/core';

/**
 * We want to use Angular's signals in the least intrusive way possible.
 * These are the minimal injectables that Angular signals assume, in order to
 * do work scheduling.
 *
 * Fortunately, ReactiveElement already has a work scheduler, and updating
 * a ReactiveElement is fast, so we'll start with just doing the simplest
 * possible thing here, and lean on ReactiveElement to make it efficient.
 */

class NoopScheduler implements ChangeDetectionScheduler {
  runningTick = false;
  notify(source: NotificationSource): void {}
}

interface SchedulableEffect {
  run(): void;
}

class MinimalEffectScheduler implements EffectScheduler {
  // Effects that are scheduled to run.
  private readonly toRun = new Set<SchedulableEffect>();
  // Whether we have a pending microtask to run the effects.
  private queued = false;

  add(e: SchedulableEffect): void {
    this.toRun.add(e);
    this.queueToRun();
  }
  remove(e: SchedulableEffect): void {}
  flush(): void {
    for (const e of this.toRun) {
      e.run();
    }
    this.toRun.clear();
  }
  schedule(e: SchedulableEffect): void {
    this.toRun.add(e);
    this.queueToRun();
  }

  private queueToRun() {
    if (this.queued) {
      return;
    }
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      this.flush();
    });
  }
}

/**
 * Note: these options are only to be used by SignalWatcher, and are not a good
 * idea for general use, as it uses an otherwise inefficient scheduler and
 * borderline nonfunctional scheduler.
 */
export const options: CreateEffectOptions = {
  injector: Injector.create({
    providers: [
      {
        provide: ChangeDetectionScheduler,
        useValue: new NoopScheduler(),
      },
      {
        provide: EffectScheduler,
        useValue: new MinimalEffectScheduler(),
      },
    ],
  }),
  manualCleanup: true,
};

type ReactiveElementConstructor = abstract new (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ...args: any[]) => ReactiveElement;

/**
 * Adds the ability for a LitElement or other ReactiveElement class to
 * watch for access to Angular signals during the update lifecycle and
 * trigger a new update when signals' values change.
 */
export function SignalWatcher<T extends ReactiveElementConstructor>(
    Base: T,
    ): T {
  abstract class SignalWatcher extends Base {
    private __dispose?: EffectRef;

    override performUpdate() {
      // ReactiveElement.performUpdate() also does this check, so we want to
      // also bail early so we don't erroneously appear to not depend on any
      // signals.
      if (this.isUpdatePending === false) {
        return;
      }
      // If we have a previous effect, dispose it
      this.__dispose?.destroy();

      // Tracks whether the effect callback is triggered by this performUpdate
      // call directly, or by a signal change.
      let updateFromLit = true;

      // We create a new effect to capture all signal access within the
      // performUpdate phase (update, render, updated, etc) of the element.
      // Q: Do we need to create a new effect each render?
      // TODO: test various combinations of render triggers:
      //  - from requestUpdate()
      //  - from signals
      //  - from both (do we get one or two re-renders)
      // and see if we really need a new effect here.
      this.__dispose = effect(() => {
        if (updateFromLit) {
          updateFromLit = false;
          super.performUpdate();
        } else {
          // This branch is an effect run from Angular signals.
          // This will cause another call into performUpdate, which will
          // then create a new effect watching that update pass.
          this.requestUpdate();
        }
      }, options);
    }

    override connectedCallback(): void {
      super.connectedCallback();
      // In order to listen for signals again after re-connection, we must
      // re-render to capture all the current signal accesses.
      this.requestUpdate();
    }

    override disconnectedCallback(): void {
      super.disconnectedCallback();
      this.__dispose?.destroy();
    }
  }
  return SignalWatcher;
}

/**
 * The LitElement class with the SignalWatcher mixin applied.
 */
export const LitElement = SignalWatcher(LitElementActual);
