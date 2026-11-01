# Profile uczniów bez konta

Nauczyciel → Zarządzaj uczniami → Dodaj ucznia: imię i nazwisko. Profil istnieje niezależnie od konta i subskrypcji ucznia. W „Słownictwo i gry” wybierz język, dodaj słowo albo importuj TXT/listę (podgląd, separatory, japońskie czytanie i zdania). „Utwórz grę z tych słówek” otwiera Saszetki Sophie z zestawem tego profilu. Uczestnik gry nadal może wejść jako gość.

Opcjonalny link jest jednorazowy i ważny siedem dni. Uczeń sam się loguje/rejestruje i akceptuje kod w swoim panelu. Samo otwarcie linku nie łączy kont. Materiały z profilu są kopiowane przy dołączeniu; nowe słówka dodane w profilu także trafiają do ucznia. Postęp ucznia dotyczy jego własnych kopii. Nauczyciel ma wgląd tylko we własne przypisane materiały. Edycja istniejącej kopii w ogólnej bibliotece nie synchronizuje zmian do wcześniejszych kopii.

Odłączenie konta zachowuje profil i nauczycielskie słownictwo; uczeń zachowuje otrzymane kopie, a nauczyciel traci dostęp do postępu. Imię i nazwisko nie trafiają do adresu zaproszenia ani publicznego pokoju gry.

## Aktualizacja

Uruchom cały aktualny accounts_setup.sql w Supabase SQL Editor (przycisk aktualizacji konfiguracji kont w panelu). Migracja jest powtarzalna, zachowuje konta i postęp, tworzy profile dla istniejących połączeń. Nie zmienia konfiguracji multiplayer. Nowe tabele są prywatne i dostępne tylko przez RPC z kontrolą właściciela. Zestawy i słówka profilu należą do nauczyciela i pojawiają się także w jego bibliotece.
