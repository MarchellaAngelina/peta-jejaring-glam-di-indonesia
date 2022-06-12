'use strict';

// Constants and fixed parameters
const BASE_TITLE = 'Peta Jejaring GLAM di Indonesia – GLAM Negara Indonesia';
const ORGS = {
  G : 'Galleries (Galeri)',
  L : 'Libraries (Perpustakaan)',
  A : 'Archives (Arsip)',
  M : 'Museums (Museum)',
}
const GLAM_TYPES = {
  Q1007870 : { org: 'G', name: 'Galeri di Indonesia'       , order: 101 },
  Q7075    : { org: 'L', name: 'Perpustakaan di Indonesia' , order: 401 },
  Q166118  : { org: 'A', name: 'Arsip di Indonesia'        , order: 501 },
  Q33506   : { org: 'M', name: 'Museum di Indonesia'       , order: 601 },
}
const SPARQL_QUERY_0 =
`SELECT DISTINCT ?siteQid ?siteLabel ?GLAMQid WHERE {
  ?site wdt:P17 wd:Q252.
   VALUES ?GLAM{
    wd:Q1007870 # Galeri
    wd:Q7075    # Perpustakaan
    wd:Q166118  # Arsip
    wd:Q33506   # Museum
  }
  ?site wdt:P31/wdt:P279* ?GLAM.
  ?site rdfs:label ?siteLabel . FILTER(LANG(?siteLabel) = "id") .
  BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
  BIND (SUBSTR(STR(?GLAM), 32) AS ?GLAMQid) . 
}
GROUP BY ?siteQid ?siteLabel ?GLAMQid
ORDER BY ?siteLabel`;
const SPARQL_QUERY_1 =
`SELECT ?siteQid ?coord WHERE {
  <SPARQLVALUESCLAUSE>
  ?site p:P625 ?coordStatement .
  ?coordStatement ps:P625 ?coord .
  # Do not include coordinates for parts
  FILTER NOT EXISTS { ?coordStatement pq:P518 ?x }
  BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
}`;
//    ?site wdt:P527 ?sitePart .
const SPARQL_QUERY_2 =
`SELECT ?siteQid ?GLAMQid ?declared ?declaredPrecision
       ?declaration ?declarationTitle ?declarationScan ?declarationText WHERE {
  <SPARQLVALUESCLAUSE>
  ?site p:P1435 ?GLAMStatement .
  ?GLAMStatement ps:P1435 ?GLAM .
  VALUES ?GLAM{
    wd:Q1007870 # Galeri
    wd:Q7075    # Perpustakaan
    wd:Q166118  # Arsip
    wd:Q33506   # Museum
  }
  FILTER NOT EXISTS { ?GLAMStatement pqv:P582 ?endTime }
  OPTIONAL {
    ?GLAMStatement pqv:P580 ?declaredValue .
    ?declaredValue wikibase:timeValue ?declared ;
                   wikibase:timePrecision ?declaredPrecision .
  }
  OPTIONAL {
    ?GLAMStatement pq:P457 ?declaration .
    ?declaration wdt:P1476 ?declarationTitle .
    OPTIONAL { ?declaration wdt:P996 ?declarationScan }
    OPTIONAL {
      ?declarationText schema:about ?declaration ;
                       schema:isPartOf <https://id.wikisource.org/> .
    }
  }
  BIND (SUBSTR(STR(?site       ), 32) AS ?siteQid       ) .
  BIND (SUBSTR(STR(?GLAM), 32) AS ?GLAMQid) .
}`;
const SPARQL_QUERY_3 =
`SELECT ?siteQid ?image ?wikipediaUrlTitle WHERE {
  <SPARQLVALUESCLAUSE>
  OPTIONAL { ?site wdt:P18 ?image }
  OPTIONAL {
    ?wikipediaUrl schema:about ?site ;
                  schema:isPartOf <https://id.wikipedia.org/> .
  }
  BIND (SUBSTR(STR(?site        ), 32) AS ?siteQid          ) .
  BIND (SUBSTR(STR(?wikipediaUrl), 31) AS ?wikipediaUrlTitle) .
}`;

const SPARQL_QUERY_4 =
`SELECT ?siteQid ?image ?wikipediaUrlTitle WHERE {
  <SPARQLVALUESCLAUSE>
  OPTIONAL { ?site wdt:P18 ?image }
  OPTIONAL {
    ?wikipediaUrl schema:about ?site ;
                  schema:isPartOf <https://en.wikipedia.org/> .
  }
  BIND (SUBSTR(STR(?site        ), 32) AS ?siteQid          ) .
  BIND (SUBSTR(STR(?wikipediaUrl), 31) AS ?wikipediaUrlTitle) .
}`;

const ABOUT_SPARQL_QUERY =
`SELECT DISTINCT ?siteQid ?siteLabel ?GLAMQid (SAMPLE(?koordinat_tempat) AS ?koordinat_tempat)  WHERE {
  ?site wdt:P17 wd:Q252.
   VALUES ?glam{
    wd:Q1007870
    wd:Q7075
    wd:Q166118
    wd:Q33506
  }
  ?site wdt:P31/wdt:P279* ?glam.
   OPTIONAL {
    ?site wdt:P625 ?koordinat_tempat.
  }
  ?site rdfs:label ?siteLabel . FILTER(LANG(?siteLabel) = "id") .
  BIND (SUBSTR(STR(?site), 32) AS ?siteQid) .
  BIND (SUBSTR(STR(?glam), 32) AS ?GLAMQid) . 
}
GROUP BY ?siteQid ?siteLabel ?GLAMQid
ORDER BY ?siteLabel`;

// Globals
var GLAMIndex;  // Index of GLAM types