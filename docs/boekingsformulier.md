# Boekingsformulier

Het boekingsformulier hoort bij de app zelf. Er is geen externe formulierdienst meer nodig, en gasten
hoeven niet in te loggen.

- Adres: `https://verhuur.vakantiehuis-ducdalf.nl/boeken/`
- De knoppen **Boeken** en **Boek nu** op de website wijzen ernaartoe.

## Wat de gast ziet

- Een kalender met de beschikbaarheid.
  - Bezette nachten zijn doorgestreept en niet te kiezen.
  - Bezet zijn alle boekingen in de app die niet geannuleerd zijn, ook opties.
  - Ook de eigen verblijven uit Google Agenda tellen mee. Daarvoor gelden dezelfde instellingen als in
    de kalender van de app: Instellingen → Google Agenda.
  - De gast ziet alleen datums, nooit namen.
  - Een vertrekdag is weer vrij als aankomstdag.
  - Het minimum aantal nachten geldt zoals bij Prijzen: de algemene regel en die per seizoen.
- Daarnaast vraagt het formulier naar het aantal volwassenen en kinderen (tot het maximum aantal
  personen), naam, e-mailadres, telefoon (niet verplicht) en opmerkingen.
- Er wordt geen prijs getoond.
- Na het versturen ziet de gast een bedankscherm. Er gaat **geen** automatische mail naar de gast.

## Wat er in de app gebeurt

Een aanvraag wordt meteen een **boeking** met:

- **status** "Aanvraag", **bron** "Eigen website";
- de **huurder**: een bestaande huurder met hetzelfde e-mailadres, of anders een nieuwe huurder. Bij een
  bestaande huurder wordt niets overschreven;
- de **prijs** volgens de seizoenen, de schoonmaakkosten en de parkkosten, en het richtbedrag
  toeristenbelasting. Dezelfde berekening als bij een nieuwe boeking in de app;
- **betaalwijze** aanbetaling volgens de instellingen;
- de **opmerking** van de gast in de notities.

De aanvraag staat bovenaan bij **Acties** ("Nieuwe boekingsaanvraag") tot je de status op "In afstemming"
zet. Ook krijg je een korte melding per e-mail op het afzenderadres, met een link naar de boeking.

## Spam en misbruik

- Een verborgen veld en een minimale invultijd, net als bij het aanmeldformulier.
- Per internetverbinding kunnen maximaal 10 aanvragen per 10 minuten worden verstuurd.
- De server controleert alles opnieuw, ook of de periode nog vrij is.
