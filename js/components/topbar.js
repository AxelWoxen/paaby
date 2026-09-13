/* topbar.js — Felles topbar for hele siden (forside, /om/, /personvern/, /uke/).
   Ett sted å endre markup: dette skriptet setter inn HTML-en synkront der
   <script src="/js/components/topbar.js"></script> står i body, og skrur
   på hamburgermenyen. Bruk alltid root-relative stier ("/bilder/…") her,
   siden filen inkluderes fra flere mappedybder (/, /om/, /personvern/, /uke/).

   #vis-følger/#vis-lagret hører IKKE hjemme her — de er skjulte tilstands-
   knapper som kun main.js (feeden på forsiden) kobler til. De ligger derfor
   direkte i index.html, ikke i denne delte komponenten. Uten dem er
   følgerKn/lagretKn under null, og menyen sender i stedet brukeren til
   forsiden — riktig oppførsel på sider uten feed. */

(() => {
  const html = `
  <div class="topbar">
    <header class="topptekst topbar-innhold">

      <div class="logo-lockup" aria-label="påby">
        <img class="logo-hovedlogo" src="/bilder/paaby-logo.svg" alt="" />
      </div>

      <p class="tagline">Det du ellers hadde gått glipp av</p>

      <div class="meny-dropdown">
        <button type="button" id="meny-knapp" class="meny-knapp" aria-haspopup="true" aria-expanded="false" aria-controls="meny-panel" aria-label="Meny">
          <svg class="meny-ikon" viewBox="0 0 106 81" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M0 1.99849V79.0015C0 80.1104 0.763777 81 1.6927 81H104.307C105.247 81 106 80.0982 106 79.0015V1.99849C106 0.889573 105.236 0 104.307 0H1.6927C0.753456 0 0 0.901759 0 1.99849ZM18.7538 14.5378H87.2461C90.7967 14.5378 93.6763 17.9377 93.6763 22.1297V25.8098C93.6763 30.0018 90.7967 33.4017 87.2461 33.4017H18.7538C15.2033 33.4017 12.3237 30.0018 12.3237 25.8098V22.1297C12.3237 17.9377 15.2033 14.5378 18.7538 14.5378ZM12.3237 58.8581V55.0439C12.3237 50.852 15.2033 47.4521 18.7538 47.4521H87.2461C90.7967 47.4521 93.6763 50.852 93.6763 55.0439V58.8581C93.6763 63.0501 90.7967 66.45 87.2461 66.45H18.7538C15.2033 66.45 12.3237 63.0501 12.3237 58.8581Z" fill="currentColor"/>
          </svg>
        </button>
        <div id="meny-panel" class="meny-panel" role="menu">
          <button type="button" id="meny-folger" class="meny-lenke" role="menuitem">Følger</button>
          <button type="button" id="meny-lagret" class="meny-lenke" role="menuitem">Lagret</button>
          <hr class="meny-skille" role="separator" />
          <a href="/om/" class="meny-lenke" role="menuitem">Om Påby</a>
        </div>
      </div>
    </header>
  </div>`;

  /* Settes inn synkront rett før dette <script>-elementet, slik at
     topbaren finnes i DOM-en med en gang — ingen "hopp" når den dukker opp. */
  document.currentScript.insertAdjacentHTML('beforebegin', html);

  function initMeny() {
    const dropdown   = document.querySelector('.meny-dropdown');
    const knapp      = document.getElementById('meny-knapp');
    const følgerKn   = document.getElementById('vis-følger');
    const lagretKn   = document.getElementById('vis-lagret');
    const menyFølger = document.getElementById('meny-folger');
    const menyLagret = document.getElementById('meny-lagret');
    if (!dropdown || !knapp) return;

    function lukkMeny() {
      dropdown.classList.remove('apen');
      knapp.setAttribute('aria-expanded', 'false');
    }

    function åpneMeny() {
      dropdown.classList.add('apen');
      knapp.setAttribute('aria-expanded', 'true');
    }

    knapp.addEventListener('click', () => {
      if (dropdown.classList.contains('apen')) lukkMeny();
      else åpneMeny();
    });

    /* Lukk ved klikk utenfor menyen. */
    document.addEventListener('click', (hendelse) => {
      if (dropdown.classList.contains('apen') && !dropdown.contains(hendelse.target)) {
        lukkMeny();
      }
    });

    /* Lukk med Escape, og gi fokus tilbake til knappen. */
    document.addEventListener('keydown', (hendelse) => {
      if (hendelse.key === 'Escape' && dropdown.classList.contains('apen')) {
        lukkMeny();
        knapp.focus();
      }
    });

    /* Speiler .aktiv-tilstanden fra de ekte knappene over på menypunktene
       (diskret aksentfarge, se .meny-lenke.aktiv i css/stil.css). */
    const synkroniserAktiv = () => {
      menyFølger?.classList.toggle('aktiv', Boolean(følgerKn?.classList.contains('aktiv')));
      menyLagret?.classList.toggle('aktiv', Boolean(lagretKn?.classList.contains('aktiv')));
    };

    /* følgerKn/lagretKn finnes kun på forsiden (der main.js har koblet dem
       til feed-visningen). På andre sider (/om/, /personvern/, /uke/) finnes
       ikke visningene — send brukeren til forsiden i stedet for en knapp som
       ikke gjør noe. */
    menyFølger?.addEventListener('click', () => {
      if (følgerKn) {
        følgerKn.click();
        synkroniserAktiv();
        lukkMeny();
      } else {
        window.location.href = '/';
      }
    });

    menyLagret?.addEventListener('click', () => {
      if (lagretKn) {
        lagretKn.click();
        synkroniserAktiv();
        lukkMeny();
      } else {
        window.location.href = '/';
      }
    });

    synkroniserAktiv();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMeny);
  } else {
    initMeny();
  }
})();
