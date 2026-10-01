---
"xmlui": patch
---

Keep notifications below modal dialogs and popovers so a long-lived message cannot intercept a dialog control or dismiss the dialog through click-away. Notifications remain dismissible on the application surface after the dialog closes, including when a dialog is open on initial render.
