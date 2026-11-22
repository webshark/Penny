// Lead the hero with the visitor's OS; without JS, Windows stays primary. iPads report as Mac, so touch rules them out.
const ua = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent;
const mac = /mac/i.test(ua);
const os = /android|iphone|ipad/i.test(navigator.userAgent) || (mac && navigator.maxTouchPoints > 1) ? null
  : mac ? 'mac' : /linux|x11|cros|chrome os/i.test(ua) ? 'linux' : null;
const lead = os && document.querySelector(`.cta [data-os="${os}"]`);
if (lead) {
  for (const b of document.querySelectorAll('.cta [data-os]')) b.classList.replace('btn-primary', 'btn-ghost');
  lead.classList.replace('btn-ghost', 'btn-primary');
  lead.parentElement.prepend(lead);
}
