# Zeszyt, tablica i materiały

Uruchom `platform-update-20261111.sql` w Supabase SQL Editor po dotychczasowej konfiguracji kont, panelu nauczyciela, zestawów ćwiczeń i Kolekcji. Plik dodaje nowe tabele/funkcje; nie usuwa słówek ani wyników. Zawiera również poprawkę losowania Kolekcji.

- W profilu ucznia: Połącz konto przez e-mail, Zeszyt ucznia, Tablica ucznia.
- Zaproszenie pojawia się na koncie ze zweryfikowanym adresem e-mail; uczeń akceptuje je na platformie. Nie jest wysyłana wiadomość e-mail.
- Zeszyt: nauczyciel dodaje nazwane linki HTTPS; przypisany uczeń odczytuje je na swoim koncie. Uprawnienia zewnętrznych dokumentów są ustawiane w usłudze docelowej.
- Tablice: zapis w Supabase, dostęp właściciela i przypisanego, niezablokowanego ucznia. Automatyczny zapis i odświeżanie co 3 sekundy. Konflikt wersji zachowuje lokalne zmiany zamiast nadpisania drugiego urządzenia.
- Tablica ma 1–200 slajdów, limit 25 MB, cofanie/ponawianie, pisak, gumkę, tekst, karteczki, przesuwanie i obrazy. PDF jest rasteryzowany w przeglądarce: każda strona staje się osobnym slajdem z zablokowanym tłem.
- Obrazy słówek: HTTPS lub PNG/JPEG/WebP z komputera; upload jest zmniejszany przed zapisem. Obrazy pojawiają się w listach i fiszkach.
- Pary języków: język słówek oraz język tłumaczenia (polski/angielski/japoński/hiszpański). Dotychczasowe listy domyślnie mają polskie tłumaczenia.

Testy: `classroom-tools-db.test.cjs`, `classroom-tools-ui.test.cjs`. Import PDF sprawdzony również na rzeczywistym dwustronicowym PDF w przeglądarce.
