# ERŐNAPLÓ

Magyar nyelvű, mobilra tervezett edzésnapló legfeljebb három embernek. React JS + Vite alkalmazás, GitHub Pages tárhellyel, Firebase Authentication belépéssel és felhasználónként elkülönített Cloud Firestore adatokkal. Androidra és iPhone-ra a böngészőből telepíthető PWA.

A GitHub Pages beállításának és a telefonos telepítésnek a lépései a [TELEPITES_TELEFONRA.txt](TELEPITES_TELEFONRA.txt) fájlban vannak. A stílushoz illő lime súlyzóikon Androidra, maskable változatban és iPhone-ra is elkészül; minden build újragenerálja.

Az új bemelegítő/munkasorozat-kezelés, a kizárólag tájékoztató súlyajánlás, a régi adatok megőrzése és a **szabályok → frontend** élesítési sorrend részletes leírása: [BEMELEGITES_ES_SULYAJANLAS.md](BEMELEGITES_ES_SULYAJANLAS.md). Az alapérték összesen 4 sor: az első bemelegítő, a többi munka, 10-es ismétléscéllal. A régi négy sor is négy marad. Az ajánlás az új edzésnél, a korábbi befejezett eredmény után jelenik meg, helyi számítással, extra Firebase-művelet és konkrét kilogrammjavaslat nélkül.

A repository kizárólag forráskódot és telepítési fájlokat tartalmaz. A valódi email-címek, jelszavak, engedélyezett UID-k és edzésadatok a Firebase-ben maradnak. Az alábbi példaértékeket cseréld ki a saját beállításaidra; személyes adatot ne írj a README-be vagy a forráskódba.

## Edzéstervek és teljes edzések

Először készíts tervet az **Edzéstervek** oldalon (például Mell nap), és add hozzá a gyakorlatokat, sorozatokat és ismétléseket. Az **Edzés rögzítése** gombnál válaszd ki a tervet: a gyakorlatok automatikusan megjelennek, mellettük az előző befejezett edzés dátumával és sorozatonkénti eredményeivel. A mai mezők előtöltődnek, és szabadon módosíthatók. Nincs teljesítési jelölőnégyzet; mentéskor a megmaradt sorozatok elvégzettnek számítanak. A nem végzett sorozatokat töröld. Az érintetlen előtöltés önmagában nem kap fejlődésjelzést.

Egy mentés a teljes edzést rögzíti a kiválasztott naptári napra; egy napra több edzés is rögzíthető. A naptárban a teljes edzés szerkeszthető vagy törölhető. Tervenként legfeljebb 10 gyakorlat, gyakorlatonként 20 sorozat adható meg. A terv módosítása vagy törlése a régi naplókat nem írja át. A korábbi bejegyzések naponta csoportosítva megmaradnak.

A meglévő jogosultságvédett Firestore-séma használatban marad: a terv gyakorlatlistája a plans.exercises szövegmezőben, az edzéscsoport metaadatai a workouts.notes mezőben tárolódnak strukturált formában. A sorozatok a saját users/{uid}/workoutSets útvonalon maradnak. Az összes gyakorlat és sorozat egy atomi mentésben frissül, külön fejlécdokumentum nélkül. A tervalapú változathoz nem kell újra publikálni a már működő, sorozatonkénti Firestore-szabályokat. A telepítési lépések lent, a használat részletesen a HASZNALATI_UTMUTATO.txt fájlban található.

## Új, harmadik felhasználó felvétele

1. Firebase Console → Firestore Database → Rules: a repository aktuális `firestore.rules` fájljának teljes tartalmát másold be, majd **Publish**. A frissített szabály két vagy három különböző UID-t fogad el; így a meglévő két fiók a beállítás közben is működik.
2. Authentication → Users: az új email/jelszavas fiókot kézzel hozd létre, és másold ki az UID-jét.
3. Firestore → Data → `access/allowedUsers` → `uids` tömb: a meglévő kettő mellé harmadik **string** elemként add hozzá az új UID-t. A korábbi kettőt ne cseréld le. Négy UID vagy ismétlődő/üres érték minden hozzáférést tilt.

Valódi UID-t kizárólag ebben a privát Firestore-dokumentumban tárolj; a repositoryba és az Actions-változókba ne kerüljön. A GitHub Actions nem publikálja a Firebase-szabályokat.

## 1. Firebase beállítása

1. Nyisd meg a [Firebase Console-t](https://console.firebase.google.com/), és hozz létre egy projektet az ingyenes **Spark** csomagban. Google Analytics nem szükséges. Ne kapcsolj hozzá számlázási fiókot.
2. A projektbeállításokban adj hozzá **Web** alkalmazást. Firebase Hosting beállítását ne válaszd: a weboldal GitHub Pages-en fut.
3. Jegyezd fel a webalkalmazás Firebase-konfigurációját: `apiKey`, `authDomain`, `projectId`, `appId`, valamint az opcionális `storageBucket` és `messagingSenderId` mezőket.
4. **Authentication → Sign-in method → Email/Password:** engedélyezd az email/jelszó belépést. Az email-linkes és más belépési módok nem szükségesek.
5. **Authentication → Users → Add user:** manuálisan hozd létre az engedélyezett fiókokat külön email-címmel és külön, erős jelszóval. A jelszavakat közvetlenül, privát csatornán adjátok át egymásnak. Ne küldd el őket GitHub issue-ban vagy commitban.
6. Másold ki a két vagy három engedélyezett felhasználó **UID** értékét. Ezeket csak az alábbi privát Firestore-dokumentumba kell beírni.
7. **Firestore Database → Create database:** hozd létre az alapértelmezett `(default)` adatbázist, európai régióban, **production mode** beállítással. Ne használj mindenki számára olvasható „test mode” szabályokat.

### Szerveroldali engedélylista

A Firebase Console **Firestore Database → Data** felületén hozd létre ezt a dokumentumot:

```text
Collection: access
Document ID: allowedUsers
Field: uids
Type: array
  0: az első felhasználó tényleges UID-je (string)
  1: a második felhasználó tényleges UID-je (string)
```

Két vagy három, egymástól különböző, nem üres UID szerepeljen a tömbben. A konzol adminisztrátori hozzáféréssel írja ezt a dokumentumot; a webalkalmazásnak nincs olvasási vagy írási joga hozzá. Nincs szükség az UID-k GitHub-változókba vagy frontendkódba másolására. Hiányzó vagy hibás engedélylista esetén a hozzáférés tiltott marad.

A jogosultságot a `firestore.rules` ellenőrzi: csak az engedélyezett felhasználó olvashatja és írhatja a saját `users/{sajátUid}/workouts/*`, `users/{sajátUid}/workoutSets/*` és `users/{sajátUid}/plans/*` dokumentumait. A másik felhasználó adatai és minden további adatútvonal tiltott. A saját `users/{sajátUid}/access/check` útvonal szerveroldali jogosultságpróba; ide nem kell dokumentumot létrehozni. A kliens ezt frissen, a szerverről ellenőrzi, mielőtt megnyitná a védett felületet.

### Security Rules élesítése

Telepített Node.js és projektfüggőségek mellett, a projektmappában:

```sh
npm ci
npx firebase login
npx firebase deploy --only firestore:rules --project SAJAT_FIREBASE_PROJECT_ID
```

Alternatívaként másold a `firestore.rules` **teljes tartalmát** a Firebase Console **Firestore Database → Rules** szerkesztőjébe, és kattints a **Publish** gombra. A két módszer közül elég az egyik. A GitHub Pages deploy nem publikál Firebase-szabályokat; a szabályok módosításakor ezt a lépést ismételd meg.

Az alkalmazásban nincs regisztráció. A Firebase publikus email/jelszó API-ján technikailag létrejöhet egy további, nem engedélyezett Authentication-fiók; ettől az illető nem kap alkalmazás- vagy adathozzáférést. A valódi biztonsági határt a szerveroldali UID-engedélylista és a Security Rules adja. Ha az Authentication-fiók létrehozását is teljesen le szeretnéd tiltani a végfelhasználóknak, az külön szolgáltatói beállítás lehet; az ingyenes megoldás adatvédelme nem támaszkodik fizetős funkcióra.

## 2. Helyi indítás

Szükséges **Node.js 22.12 vagy újabb** (ajánlott a 24 LTS), npm és Git. A Firebase-emulátoros tesztekhez **Java JDK 21 vagy újabb** is szükséges.

Másold a `.env.example` fájlt `.env.local` néven a projekt gyökerébe, majd töltsd ki a saját Firebase webkonfigurációddal:

| Környezeti változó | Firebase-konfiguráció | Kötelező |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | `apiKey` | igen |
| `VITE_FIREBASE_AUTH_DOMAIN` | `authDomain`, általában `projekt.firebaseapp.com` | igen |
| `VITE_FIREBASE_PROJECT_ID` | `projectId` | igen |
| `VITE_FIREBASE_APP_ID` | `appId` | igen |
| `VITE_FIREBASE_STORAGE_BUCKET` | `storageBucket` | nem |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` | nem |

```sh
npm ci
npm run dev
```

A terminálban megjelenő helyi URL-t nyisd meg. A `.env.local` figyelmen kívül marad a Git számára. A konfiguráció módosítása után indítsd újra a fejlesztői szervert. Éles Firebase-adatokkal csak a saját projekted és fiókod használatával dolgozz; a tesztekhez az emulátort használd.

Firebase-konfiguráció nélkül az alkalmazás konfigurációs üzenetet és bejelentkezési felületet mutat; nem vált védelem nélküli bemutató módra.

## 3. Közzététel GitHub Pages-en

### Repository és Actions-változók

1. Hozz létre egy **public** GitHub repositoryt, például `eronaplo` néven. A GitHub Pages és a szokásos GitHub-hostolt Actions futtatás nyilvános repository esetén ingyenesen használható. [GitHub útmutató](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site)
2. A repositoryban **Settings → Secrets and variables → Actions → Variables → New repository variable** alatt add meg a fenti négy kötelező `VITE_FIREBASE_*` változót. A két opcionális változót is megadhatod.
3. **Settings → Pages → Build and deployment → Source:** válaszd a **GitHub Actions** lehetőséget.
4. A projektmappából töltsd fel a forráskódot. Egy új, üres repository esetén:

```sh
git init -b main
git add .
git status --short
git commit -m "React PWA edzesnaplo GitHub Pages telepitessel"
git remote add origin https://github.com/FELHASZNALO/eronaplo.git
git push -u origin main
```

A `git status` ellenőrzésénél a `.env.local`, `node_modules`, `dist` és személyes adatfájlok ne szerepeljenek a feltöltendő fájlok között. A repositoryba a `package-lock.json` is kerüljön be. Meglévő Git-repository esetén a már beállított távoli címet használd, és ne futtasd újra a `remote add` lépést.

A `.github/workflows/deploy.yml` a `main` ágra érkező push után automatikusan ellenőrzi és buildeli az alkalmazást, majd a `dist` tartalmát GitHub Pages-re publikálja. Az **Actions** lapon követhető az eredmény. A workflow kézzel is indítható a **Run workflow** gombbal. Pull requestnél az ellenőrzések futnak, éles publikálás nem történik.

A webcím normál projekt-repository esetén:

```text
https://FELHASZNALO.github.io/eronaplo/
```

Az éles URL-t a sikeres deploy és a **Settings → Pages** oldal mutatja. A publikáláshoz a saját GitHub-repositoryt és Firebase-projektet ténylegesen be kell állítani; a helyi forráskód elkészítése önmagában nem jelent élő weboldalt.

### Base path és útvonalak

A Vite a `GITHUB_REPOSITORY` alapján automatikusan `/<repositorynév>/` base path értékkel buildel. A `FELHASZNALO.github.io` nevű repositorynál a base `/`. Egyedi domain esetén add meg a `VITE_BASE_PATH` Actions-változót `/` értékkel. Helyi buildnél a `.env.local` fájlban is megadható például `VITE_BASE_PATH=/eronaplo/`.

Az alkalmazás `HashRouter` útvonalakat használ, például `.../eronaplo/#/naplo`. Emiatt az aloldalak frissítése és közvetlen megnyitása nem igényel szerveroldali átirányítást. A manifest, ikonok és service worker ugyanahhoz a base pathhoz igazodnak. [Vite GitHub Pages dokumentáció](https://vite.dev/guide/static-deploy#github-pages)

### Firebase engedélyezett domain

**Firebase Console → Authentication → Settings → Authorized domains → Add domain:**

```text
FELHASZNALO.github.io
```

Csak a domaint írd be: ne tartalmazzon `https://` előtagot, repositorynevet vagy záró perjelet. Egyedi domain használatakor azt is vedd fel. A `VITE_FIREBASE_AUTH_DOMAIN` értéke ettől még a Firebase webkonfiguráció eredeti `authDomain` értéke marad.

Helyi, éles Firebase-szel végzett próbához szükség esetén külön add hozzá a `localhost` domaint; új Firebase-projekteknél ez már nem automatikus. Az emulátoros tesztekhez nem kell éles domaint engedélyezni. A domainlista nem helyettesíti a Security Rules jogosultságvédelmét. [Firebase domainbeállítások](https://firebase.google.com/docs/auth/faq-and-troubleshooting#limit_your_authorized_authentication_domains)

### Mi nyilvános, és mi marad privát?

A GitHub Pages nyilvánosan szolgálja ki a HTML-, CSS-, JavaScript-, ikon- és manifestfájlokat. A Firebase webkonfiguráció a buildelt JavaScriptből kiolvasható akkor is, ha Actions-változóként adod meg. Ezek projektazonosítók; nem felhasználói jelszavak és nem adminisztrátori jogosultságok. Az adatvédelmet a Firebase Authentication és a Security Rules biztosítja. [Firebase API-kulcsok](https://firebase.google.com/docs/projects/api-keys)

**Soha ne kerüljön a repositoryba vagy `VITE_*` változóba felhasználói jelszó, szolgáltatásfiók privát kulcsa, admin SDK-hitelesítő vagy személyes adatexport.** A valódi UID-k a privát Firestore-engedélylistán maradnak. Az alkalmazás nem tárol jelszót Firestore-ban vagy saját localStorage-mezőben; a Firebase SDK a bejelentkezés fenntartásához hitelesítési munkamenetadatokat tárolhat a böngészőben.

## 4. Telepítés telefonra

### Android – Chrome

1. Nyisd meg az éles, **HTTPS** GitHub Pages URL-t Chrome-ban, internetkapcsolattal.
2. Használd az alkalmazás telepítési gombját, ha megjelenik; vagy nyisd meg a Chrome **⋮ → Telepítés és parancsikon létrehozása → Telepítés** menüpontját. Chrome-verziótól függően **Alkalmazás telepítése** vagy **Hozzáadás a kezdőképernyőhöz** néven is megjelenhet.
3. Erősítsd meg a telepítést, majd indítsd az **ERŐNAPLÓ** ikonnal.
4. Lépj be a saját, előre létrehozott fiókoddal. A főképernyős ikon önálló alkalmazásablakot nyit, böngészős címsor nélkül.

Nem szükséges APK, Google Play-fejlesztői fiók vagy áruházi közzététel. [Chrome telepítési útmutató](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid)

### iPhone és iPad – Safari

1. Nyisd meg az éles HTTPS URL-t **Safariban**.
2. Koppints a **Megosztás** gombra; egyes Safari-elrendezésekben előbb az oldalmenüt kell megnyitni.
3. Válaszd a **Főképernyőhöz adás** lehetőséget. Ha nem látható, a megosztási lap alján a műveletek szerkesztésénél engedélyezd.
4. Ha megjelenik a **Megnyitás webalkalmazásként / Open as Web App** kapcsoló, hagyd bekapcsolva, majd koppints a **Hozzáadás** gombra.
5. Indítsd az ERŐNAPLÓ ikonnal, és lépj be a saját fiókoddal. A telepített webapp saját ablakkal és böngészős címsor nélkül működik.

Az iPhone nem használja az Android automatikus telepítési felugró ablakát. A Safari és a főképernyős webapp munkamenete elkülönülhet, ezért telepítés után új belépésre lehet szükség. [Apple telepítési útmutató](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios)

## 5. Offline működés, kijelentkezés és frissítések

- A service worker az első sikeres online megnyitás után az alkalmazás **statikus fájljait** gyorsítótárazza. A felület és a bejelentkezési képernyő ezután internet nélkül is betölthető.
- Az edzésnaplók és edzéstervek nem kerülnek service worker cache-be, IndexedDB-alapú Firestore-adatgyorsítótárba vagy saját localStorage-ba. A megnyitott munkamenet adatai csak memóriában élnek.
- Új belépéshez, újraindítás utáni hozzáférés-ellenőrzéshez és mentéshez hálózat kell. Az offline mód nem biztosít teljes, tartós edzésnapló-szerkesztést. Az alkalmazás nem jelzi sikeres mentésnek a szerver által még el nem fogadott adatot.
- Kijelentkezéskor a védett felület eltűnik, a felhasználói állapot és az adatgyorsítótár törlődik. A következő felhasználó nem kapja meg az előző felhasználó naplóját. A böngésző Vissza gombja sem nyithat hitelesítés nélküli védett nézetet.
- A Firebase saját munkamenetkezelése frissítés után megőrizheti a belépést, de a védett felületet friss szerveroldali jogosultságpróba előzi meg.
- Az alkalmazás előtérbe hozáskor, hálózat-visszatéréskor és aktív használat közben 5 percenként újra ellenőrzi a hozzáférést. A szerver az engedély visszavonását azonnal érvényesíti; a már megnyitott felület a következő sikeres ellenőrzéskor zárul le. Hálózatkimaradáskor az aktuális munkamenet korábban betöltött adatai memóriában láthatók maradhatnak.
- A mentés közvetlen, hitelesített Firestore-kérés, offline írási sor nélkül. Ha 15 másodpercig nem érkezik visszaigazolás, az űrlap ismét használhatóvá válik. Bizonytalan eredményű kérés után először ellenőrizd a naplót, mielőtt újra rögzítenéd ugyanazt.
- Új alkalmazásverziónál frissítési értesítés jelenik meg. Előbb mentsd az aktuális bevitelt, majd fogadd el a frissítést; a frissítés újratölti az oldalt.

Elveszett telefon esetén a készülék zárolása mellett változtasd meg az érintett Firebase-fiók jelszavát, vagy tiltsd le a fiókot a Console-ban, és távolítsd el az UID-jét az engedélylistából. Egyetlen UID-t tartalmazó lista minden hozzáférést letilt, amíg ismét két különböző, jóváhagyott UID nem szerepel benne. A már megtekintett adatot egy szerveroldali visszavonás nem tudja kitörölni egy korábban készült képernyőképből.

## 6. Ellenőrzés

```sh
npm run build
npm run test:pwa
npm run test:rules
npm run test:e2e
```

A szabálytesztek a helyi Firestore-emulátort használják, nem az éles adatbázist. A böngészőtesztek Chromium és WebKit motorral futnak, szintetikus emulátorfiókokkal. Ha a tesztböngészők nincsenek telepítve:

```sh
npx playwright install chromium webkit
```

A Java-alapú Firebase-emulátorokhoz JDK 21 vagy újabb ajánlott. Az első emulátor- és böngészőtelepítéshez internetkapcsolat szükséges. A GitHub Actions ugyanezekhez előkészíti a környezetet.

Windows alatt, ha a projekt vagy az emulátor gyorsítótárának elérési útjában `!` karakter van, a Java-emulátor indítása hibázhat. Ebben az esetben a tesztek előtt ugyanabban a PowerShell-ablakban állíts be egyszerű, ideiglenes cache-elérési utat:

```powershell
$env:FIREBASE_EMULATORS_PATH = Join-Path $env:TEMP 'eronaplo-emulator-cache'
npm run test:rules
npm run test:e2e
```

Ez csak a helyi tesztemulátor letöltött programfájljainak helyét módosítja; az éles adatbázist nem érinti.

Az éles Firebase-konfiguráció és a valódi telefonok beállítása után ellenőrizd:

1. Kijelentkezve a közvetlen `#/naplo` és más védett útvonal is csak a belépést mutassa.
2. Mindegyik engedélyezett fiók külön beléphessen, és frissítés után a saját adatait lássa.
3. Az első felhasználó által mentett edzés ne jelenjen meg a másodiknál; szabálytesztben a másik UID útvonalának közvetlen olvasása és írása is legyen tiltott.
4. Kijelentkezés, majd visszalépés és fiókváltás után ne jelenjen meg az előző napló.
5. Nem engedélyezett fiókkal a védett felület és a Firestore-adatok maradjanak elérhetetlenek.
6. A telepített Android- és iPhone-app önálló ablakban induljon. Offline újraindítva töltse be az alkalmazás keretét, de ne mutasson korábbi személyes adatot.
7. Kis mobilon, nagy mobilon, tableten, laptopon, valamint fekvő tájolásban ellenőrizd a beviteli mezőket és a navigációt. A numerikus billentyűzet, az iPhone biztonságos képernyőterületei és a virtuális billentyűzet viselkedése valódi eszközön is próbálandó.

### Elkészült helyi ellenőrzések – 2026. november 10.

- **61/61 unit teszt**: régi tervek és naplók, sorrendet megőrző előtöltés, ajánlási feltételek, célértékek, atomi és írástakarékos mentés, elérési utak.
- **35/35 Firestore Security Rules teszt**: a három fiók elkülönítése, illetéktelen hozzáférés tiltása, régi és új sorozatformátumok, célértékek, mezők megőrzése és 210 dokumentumos atomi edzésmentés.
- **18/18 Chromium/WebKit böngészőteszt**: meglévő folyamatok, összesen négy sor megőrzése, első sor bemelegítőként, az eredeti sorrendű előtöltés, előző edzésből megjelenő ajánlás, elrejtés, egyéni célok pillanatképei, hálózati hibák és hozzáférésvédelem. Újrapróbálás nélkül sikeres.
- A legutóbbi javítás külön **2/2 Chromium/WebKit regressziótesztje** is sikeres: egy lassú vagy hibás előzménykeresés nem rejti el a másik gyakorlat ajánlását. Az élesítést megelőző Actions-folyamat már mind a 20 böngészőtesztet lefuttatja.
- Sikeres éles build és PWA-ellenőrzés: manifest, ikonméretek, service worker és offline előtöltés.
- Mobilos, tabletes, asztali és fekvő méretek; az új terv- és sorozatfelület 320 px szélességen sem lóg ki.

Ezek helyi builden és szintetikus emulátorfiókokkal végzett ellenőrzések. GitHub Pages-publikálás és fizikai Android/iPhone-telepítési próba nem része ezeknek a helyi automatizált ellenőrzéseknek. Ezeket a fenti útmutató alapján kell elvégezni.

## 7. Ingyenes üzemeltetés

### Takarékos működés

Induláskor a legutóbbi 100 gyakorlatbejegyzés és csak azok sorozatai töltődnek be. A régebbiek 100-as lapokban, külön gombbal kérhetők le. A statisztikák a betöltött adatokat mutatják; részleges előzmény esetén erre külön jelzés figyelmeztet. Az edzésrögzítő régebbi előzményt is keres a terv kiválasztásakor vagy az edzés dátumának változtatásakor, és csak a kiválasztott korábbi nap megfelelő sorozatait kéri le. A keresési eredmények és korábbi oldalak munkameneten belüli memóriagyorsítótárban maradnak.

Mentéskor csak a megváltozott sorozatok íródnak újra, csökkenő sorozatszámnál csak a valóban korábban létező sorozathelyek törlődnek. Változatlan mentés nem küld írást. Négy sorozatos új gyakorlat 5 írás; egyetlen sorozat módosítása tipikusan 2 írás. A rendszeres jogosultságpróba 5 percenként és előtérbe kerüléskor fut. A szerver minden tényleges adatlekérést és írást továbbra is önállóan ellenőriz.

A részletes használati útmutató és a feltételezésekkel megadott fogyasztási becslés a `HASZNALATI_UTMUTATO.txt` fájlban található. Az alapforgalom idővel nem nő a teljes napló méretével; a kézi régi betöltések és az előzménykeresés külön olvasási forgalmat jelentenek.

A megoldás nem használ Firebase Hostingot, Cloud Functions-t, fizetős API-t, SMS-belépést vagy fizetős infrastruktúrát. GitHub Pages szolgálja ki a PWA-t; Firebase Spark kezeli az email/jelszó belépést és a Firestore-adatokat. Két ember magáncélú naplózása kis forgalmat jelent, de az ingyenes keret nem korlátlan.

A Firestore jelenlegi díjmentes kerete projektenként egy adatbázishoz: **1 GiB tárolás, napi 50 000 dokumentumolvasás, 20 000 írás és 20 000 törlés, havi 10 GiB kimenő adatforgalom**. A szabályok jogosultságellenőrző olvasásai is fogyaszthatnak kvótát. A használatot a Firebase Console-ban kövesd. Spark csomagban számlázás nélkül a kvóta túllépése szolgáltatási korlátozást okozhat, ezért a működés nem garantálható korlátlan forgalomra. [Firestore keretek](https://firebase.google.com/docs/firestore/quotas), [Firebase csomagok](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)

## Fontos fájlok

| Fájl | Feladat |
| --- | --- |
| `vite.config.js` | React, GitHub Pages base path, PWA-manifest és service worker generálása |
| `index.html` | Mobil viewport, iPhone webapp- és ikonbeállítások |
| `public/` | Saját alkalmazásikonok és statikus fájlok |
| `.github/workflows/deploy.yml` | Automatikus ellenőrzés, build és Pages deploy |
| `src/auth/AuthContext.jsx` | Firebase email/jelszó belépés, szerveres hozzáféréspróba, kijelentkezés |
| `src/lib/firebase.js` | Firebase inicializálás és memóriabeli Firestore-cache |
| `src/lib/verifyAccess.js` | Időkorlátos, szerveroldali jogosultságpróba helyi adatgyorsítótár nélkül |
| `src/lib/writeJournal.js` | Teljes edzések atomi, változásalapú mentése és törlése offline írási sor nélkül |
| `src/lib/sessions.js` | Strukturált tervek és edzéscsoportok, korábbi adatok megtartásával |
| `src/components/SessionEditor.jsx` | Tervválasztás, előző eredmények és közös edzésmentés |
| `src/components/SessionJournal.jsx` | Naptár és teljes edzések kezelése |
| `HASZNALATI_UTMUTATO.txt` | Magyar használati útmutató és fogyasztási becslés |
| `firestore.rules` | Két engedélyezett UID és felhasználónként elkülönített hozzáférés |
| `firebase.json` | Security Rules és helyi emulátorok; Firebase Hosting nélkül |
| `.env.example` | Kitölthető, személyes adatot nem tartalmazó konfigurációs minta |

A `manifest.webmanifest` és `sw.js` a build során kerül a `dist` mappába; ezeket nem kell külön kézzel szerkeszteni. A manifestben `standalone` megjelenítés és többféle ikonnal ellátott telepítés szerepel; a képernyőtájolás nincs álló módra korlátozva.
