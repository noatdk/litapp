// Runtime patches for Ionic 3's DeepLinker + Tabs to make URL deep-linking
// survive a page reload, including the case of a pushed page on top of a tab.
//
// The two upstream limitations we work around:
//
//   1) DeepLinker.init() only records the URL and listens for changes; the
//      initial URL is never *processed* end-to-end. Each NavController, Tabs,
//      and Tab pulls its own segment from the parsed URL during its lifecycle,
//      but the parser walks the live nav tree and gives up the moment it hits
//      a child nav that hasn't mounted yet. So segments past the rootmost
//      mounted nav (e.g. the StoryDetailPage in `/app/history/story/:id`)
//      get dropped on cold start.
//
//      Fix: subscribe to App.viewDidEnter, re-process the URL each time a new
//      view enters (i.e. a new nav has come online) and dispatch any segment
//      whose nav has just become reachable. Self-unsubscribes once every
//      segment has been claimed.
//
//   2) When DeepLinker dispatches a segment to a Tab via Tabs.select() with
//      fromUrl=true, and the segment doesn't match an existing view, Ionic
//      calls setRoot — which wipes the tab's own root out from underneath
//      the deep page. For shareable links like `/app/history/story/:id` we
//      want HistoryPage to remain as the back-target.
//
//      Fix: when the tab already has views, push instead of setRoot.
//
// We patch prototypes once at module load; main.ts imports this file before
// bootstrapModule so the patches apply before any DeepLinker or Tabs is
// constructed.

import { DeepLinker } from 'ionic-angular';
import { Tabs } from 'ionic-angular';
import { normalizeUrl, getNavFromTree } from 'ionic-angular/navigation/deep-linker';

// Guard against double-patching if this file is somehow imported twice.
const PATCHED_FLAG = '__litappDeepLinkPatched';

if (!(DeepLinker.prototype as any)[PATCHED_FLAG]) {
  (DeepLinker.prototype as any)[PATCHED_FLAG] = true;

  const origInit = DeepLinker.prototype.init;

  DeepLinker.prototype.init = function patchedInit() {
    const self: any = this;
    // Capture the *original* URL before origInit runs anything that might
    // navigate (and thus rewrite location). Each tab/page mounted as part of
    // the URL deep-link resolution updates the location via the linker,
    // overwriting the deep portion we still need to act on. Snapshotting
    // here keeps the original target URL stable across the retry loop.
    const initialUrl = normalizeUrl(self._location.path());
    origInit.call(this);
    self._litappInitialUrl = initialUrl;
    self._litappProcessedNavIds = {};
    self._litappViewSub = self._app.viewDidEnter.subscribe(() => {
      // Defer to next tick so the just-entered view's child navs have a
      // chance to register with their parent before we reparse.
      setTimeout(() => processInitialUrl(self), 0);
    });
  };
}

function processInitialUrl(linker: any) {
  if (!linker._litappViewSub) return;
  // Use the captured initial URL, not the current one — by the time we
  // retry, in-app navigation may have rewritten location to reflect what's
  // already mounted (typically `<root>/<tab>/<tab>`), losing the deep tail.
  const browserUrl = linker._litappInitialUrl || normalizeUrl(linker._location.path());
  const activeNavContainers = linker._app.getActiveNavContainers();
  if (!activeNavContainers || !activeNavContainers.length) return;
  const segments = linker.getCurrentSegments(browserUrl);
  if (!segments.length) {
    unsubscribe(linker);
    return;
  }
  let allHandled = true;
  for (const segment of segments) {
    if (!segment || !segment.navId) continue;
    if (linker._litappProcessedNavIds[segment.navId]) continue;
    let placed = false;
    for (const root of activeNavContainers) {
      const nav = getNavFromTree(root, segment.navId);
      if (nav) {
        linker._litappProcessedNavIds[segment.navId] = true;
        linker._loadViewForSegment(nav, segment, () => {});
        placed = true;
        break;
      }
    }
    if (!placed) allHandled = false;
  }
  if (allHandled) unsubscribe(linker);
}

function unsubscribe(linker: any) {
  if (linker._litappViewSub) {
    linker._litappViewSub.unsubscribe();
    linker._litappViewSub = null;
  }
}

// Tabs._updateCurrentTab fromUrl branch: push instead of setRoot when the tab
// already has its own root, so the back stack survives URL-driven deep links.
// (The setRoot is in _updateCurrentTab, not select — select delegates to it
// when the URL-driven tab is already the current tab, which is exactly our
// case once initTabs has selected the matching tab from the URL.)
if (!(Tabs.prototype as any)[PATCHED_FLAG]) {
  (Tabs.prototype as any)[PATCHED_FLAG] = true;

  const TabsProto = Tabs.prototype as any;
  const origUpdate = TabsProto._updateCurrentTab;

  TabsProto._updateCurrentTab = function patchedUpdate(tab: any, fromUrl: boolean) {
    if (!fromUrl || !tab || !tab._segment) {
      return origUpdate.call(this, tab, fromUrl);
    }
    const active = tab.getActive ? tab.getActive() : null;
    if (!active) return origUpdate.call(this, tab, fromUrl);
    const seg = tab._segment;
    const vc = tab.getViewById ? tab.getViewById(seg.name) : null;
    if (vc) return origUpdate.call(this, tab, fromUrl);
    // The deep-history branch (setPages) is correct as-is — let it run.
    if (tab._views && tab._views.length === 0 && seg.defaultHistory && seg.defaultHistory.length) {
      return origUpdate.call(this, tab, fromUrl);
    }
    // This is the branch we override: original would setRoot, wiping the
    // tab's own root from underneath the deep page.
    if (tab._views && tab._views.length > 0) {
      // updateUrl: true so the address bar reflects the restored deep page
      // (Ionic's setRoot path used updateUrl:false because URL was already
      // the source; for our push the tab's load step has already rewritten
      // location to the truncated `/app/<tab>/<tab>` form, so we need to
      // re-extend it with the deep segment we just pushed).
      return tab.push(seg.name, seg.data, { animate: false, updateUrl: true }).then(() => {
        tab._segment = null;
      });
    }
    return origUpdate.call(this, tab, fromUrl);
  };
}
