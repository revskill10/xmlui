---
"xmlui": patch
---

`NavGroup` gains `storageKey`: a group in a vertical navigation panel remembers whether the user left it expanded
(local storage, `xmlui.navGroup.<key>`), so a reload or another page shows it the same way. A group holding the active
link still expands; that automatic expansion is not stored. Blocked storage leaves the group working, unremembered.
