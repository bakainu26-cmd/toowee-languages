# Słownictwo dla grupy

Przy każdej grupie jest przycisk „Słownictwo dla grupy”. Nauczyciel tworzy foldery i zestawy w języku grupy, wpisuje lub importuje słówka oraz edytuje je w jednym miejscu. Może też dodać kopię istniejącego własnego folderu lub zestawu; oryginał pozostaje niezależny.

Konfiguracja: `accounts_setup.sql`, `teacher_setup.sql`, `group_vocabulary_setup.sql` w tej kolejności. „Aktualizuj panel nauczyciela” pobiera pełny zestaw konfiguracji. Migracje są powtarzalne i nie zmieniają wcześniejszych indywidualnych przypisań.

Wspólny oryginał jest powiązany z grupą. Prywatne tabele mapują jego foldery, zestawy i słowa na materiały profili oraz połączonych kont uczniów. Automatyczne wyzwalacze obsługują dodanie członka, połączenie konta, dodanie/edycję/usunięcie słowa i zmianę nazwy zestawu. Istniejące identyfikatory słówek zachowują się przy edycjach, więc postęp ucznia pozostaje oddzielny od treści. Niezmienieni członkowie nie są usuwani i dodawani na nowo podczas edycji grupy. Nowy członek od razu otrzymuje istniejące materiały. Usunięcie członka cofa jego materiały tej grupy; nie dotyka innych materiałów. Blokada profilu korzysta z dotychczasowych ograniczeń dostępu do przypisań. Uczeń widzi aktualizacje po odświeżeniu biblioteki.

Oryginały grup nie trafiają do własnego profilu ucznia administratora. Jeśli administrator jest członkiem grupy, jego profil otrzymuje własne przypisanie jak inni członkowie. Każda operacja nauczyciela sprawdza właściciela grupy, język i przynależność zestawu. Bezpośredni dostęp klientów do tabel synchronizacji jest zablokowany; pomocnicze funkcje nie mają publicznych uprawnień. Grupa posiadająca materiały zachowuje swój język.

Weryfikacja: testy `group-vocabulary-db.test.cjs`, `group-vocabulary-ui.test.cjs`, istniejące testy nauczyciela, kont, samodzielnych profili i statystyk. Podgląd przeglądarkowy sprawdza wejście z grupy, foldery/zestawy oraz edytor i import. Nawigacja zapisuje otwartą grupę i zestaw w dotychczasowym mechanizmie historii panelu.

## Układ widoku grupy

W zakładce Grupy widoczna jest lista nazw grup i liczba członków. Wybranie grupy otwiera zakładki Uczniowie i Słownictwo, domyślnie Uczniowie. „Edytuj” osadza dotychczasowy formularz nazwy, języka i członków grupy; zapis wraca do listy jej uczniów. W Słownictwie domyślnie widać foldery i zestawy, a formularze otwierają się przyciskami Dodaj folder / Dodaj zestaw. Zestaw ma jawny wybór folderu. W bazie nauczyciela widoczne są te same foldery grupowe i zestawy, bez dodatkowej kopii oryginału. Historia panelu zachowuje grupę, zakładkę i wybrany zestaw. Zmiana układu nie wymaga nowej migracji SQL. Testy integracji: group-tabs-ui.test.cjs.

## Gry dla grupy

Trzecia zakładka „Wygeneruj grę dla grupy” otwiera wybór Saszetek Sophie lub Kolekcji Sophisi, tak jak profil ucznia. Przy wyborze gry ponownie pobierane jest wspólne słownictwo grupy. Kontekst zawiera wyłącznie źródłowe foldery, zestawy i słówka tej grupy w jej języku; nie scala prywatnych materiałów członków. Dotychczasowe formularze gry wybierają całość, folder lub zestaw i ustawienia rozgrywki. Zakładka jest zapisywana w historii panelu. Aktualizacja korzysta z istniejącego API grup i gier, bez nowej migracji SQL.
