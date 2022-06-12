'use strict';


function loadPrimaryData() {
  doPreProcessing();
  populateGLAMTypesData()
    .then(populateCoordinatesData)
    .then(populateMapAndIndex)
    .then(() => {
      return Promise.all([
        populateGLAMDetailsData(),
        populateImageAndWikipediaData(),
        populateGLAMDetailsData(),
        populateWikipediaEnglishData(),
      ]);
    })
    .then(enableApp);
}


// Performs pre data post-processing: mainly initialize static content
function doPreProcessing() {

  // Set the about page WDQS link
  let anchorElem = document.getElementById('wdqs-link');
  anchorElem.href = 'https://query.wikidata.org/#' + encodeURIComponent(ABOUT_SPARQL_QUERY);

  // Update panel in case of static content
  processHashChange();
}


// Queries WDQS for the heritage site Wikidata items for national PH heritage
// GLAMs or international GLAMs of PH sites, then generates a
// Record object if needed and sets the "title", skeleton "GLAMs", and
// "indexTitle" Records fields and the SparqlValuesClause value. Also calls
// populateGLAMIndex().
function populateGLAMTypesData() {
  return queryWdqsThenProcess(
    SPARQL_QUERY_0,
    function(result) {

      let qid = result.siteQid.value;
      if (!(qid in Records)) {
        Records[qid] = new Record(false);  // Assume SimpleRecord for now
      }
      let record = Records[qid];

      if ('siteLabel' in result && result.siteLabel.value) {
        record.title = result.siteLabel.value;
      }
      else {
        record.title = '[ERROR: No title]';
      }

      let GLAMQid = result.GLAMQid.value;
      if ('partOf' in GLAM_TYPES[GLAMQid]) {
        GLAMQid = GLAM_TYPES[GLAMQid].partOf;
      }
      if (!(GLAMQid in record.GLAMs)) {
        record.GLAMs[GLAMQid] = new GLAM();
      }
    },
    function() {

      populateGLAMIndex();

      // Generate SPARQL VALUES clause for subsequent queries
      SparqlValuesClause = 'VALUES ?site {' + Object.keys(Records).map(qid => `wd:${qid}`).join(' ') + '}';

      // Generate index title for the index list and window title
      Object.values(Records).forEach(record => { record.indexTitle = record.title });
    },
  );
}


// Queries WDQS, sets the "lat" and "lon" Records fields, and sets the
// BootstrapDataIsLoaded status.
function populateCoordinatesData() {
  return queryWdqsThenProcess(
    SPARQL_QUERY_1,
    function(result) {
      let record = Records[result.siteQid.value];
      let wktBits = result.coord.value.split(/\(|\)| /);  // Note: format is Point WKT
      record.lat = parseFloat(wktBits[2]);
      record.lon = parseFloat(wktBits[1]);
    },
    function() {
      BootstrapDataIsLoaded = true;
    },
  );
}


// Queries WDQS and sets the subfields of the "GLAMs" Records field.
function populateGLAMDetailsData() {
  return queryWdqsThenProcess(
    SPARQL_QUERY_2,
    function(result) {

      let record = Records[result.siteQid.value];
      let GLAMQid = result.GLAMQid.value;
      if ('partOf' in GLAM_TYPES[GLAMQid]) {
        GLAMQid = GLAM_TYPES[GLAMQid].partOf;
      }
      if (!(GLAMQid in record.GLAMs)) {
        console.log(`ERROR: Unrecognized GLAM:${GLAMQid} for ${result.siteQid.value}`);
        return;
      };

      let GLAM = record.GLAMs[GLAMQid];
      if (!GLAM.date && 'declared' in result) {
        GLAM.date = parseDate(result, 'declared');
      }
      if (!GLAM.declarationData && 'declaration' in result) {
        GLAM.declarationData = result.declaration.value;
        GLAM.declarationTitle = result.declarationTitle.value;
        if ('declarationScan' in result) GLAM.declarationScan = result.declarationScan.value.replace(/Special:FilePath\//, 'File:');
        if ('declarationText' in result) GLAM.declarationText = result.declarationText.value;
      }
    },
  );
}



// Queries WDQS and sets the "imageFilename" and "articleTitle" Records fields.
function populateImageAndWikipediaData() {
  return queryWdqsThenProcess(
    SPARQL_QUERY_3,
    function(result) {
      let record = Records[result.siteQid.value];
      if ('image' in result) record.imageFilename = extractImageFilename(result.image);
      if ('wikipediaUrlTitle' in result) record.articleTitle = decodeURIComponent(result.wikipediaUrlTitle.value);
    },
  );
}
function populateWikipediaEnglishData() {
  return queryWdqsThenProcess(
    SPARQL_QUERY_4,
    function(result) {
      let record = Records[result.siteQid.value];
      //if ('image' in result) record.imageFilename = extractImageFilename(result.image);
      if ('wikipediaUrlTitle' in result) record.englishArticleTitle = decodeURIComponent(result.wikipediaUrlTitle.value);
    },
  );
}


// Populates the GLAM index with the total number of sites for each
// GLAM type, each organization, and for all sites as a whole.
function populateGLAMIndex() {

  // Declare index with 1 entry corresponding to the 'all' type
  GLAMIndex = { all: new GLAMIndexEntry };

  // Create index entries
  Object.keys(GLAM_TYPES)
    .filter(qid => !('partOf' in GLAM_TYPES[qid]))
    .forEach(qid => {
      GLAMIndex[qid] = new GLAMIndexEntry;
      let orgId = GLAM_TYPES[qid].org;
      if (!(orgId in GLAMIndex)) GLAMIndex[orgId] = new GLAMIndexEntry;
    });

  // Populate index entries with totals
  Object.values(Records).forEach(record => {
    GLAMIndex.all.total++;
    Object.keys(record.GLAMs).forEach(typeQid => {
      let orgId = GLAM_TYPES[typeQid].org;
      GLAMIndex[typeQid].total++;
      GLAMIndex[orgId  ].total++;
    });
  });
}


// Populates the map with map markers and the index list with items and sets the
// "mapMarker" and "popup" Records fields (for sites with coordinates), and
// "indexLi" Records field (for all sites). This also calls
// populateGLAMIndexNodes() and generateFilterSelect().
// This should be called as soon as the bootstrap data have been loaded.
function populateMapAndIndex() {

  // Populate map and list index
  let listIndex = document.getElementById('index-list');
  let mapMarkers = [];
  Object.entries(Records).forEach(entry => {

    let qid = entry[0], record = entry[1];

    // Generate map marker with popup
    // NOTE: Assume that compound sites do not have coordinates
    if (!record.isCompound && record.lat && record.lon) {
      let mapMarker = L.marker(
        [record.lat, record.lon],
        { icon: L.ExtraMarkers.icon({ icon: '', markerColor : 'orange-dark' }) },
      );
      record.mapMarker = mapMarker;
      mapMarker.bindPopup(record.title, { closeButton: false });
      let popup = mapMarker.getPopup();
      popup._qid = qid;
      record.popup = popup;
      mapMarkers.push(mapMarker);
    }

    // Generate index list item
    let li = document.createElement('li');
    li.innerHTML = `<a href="#${qid}">${record.indexTitle}</a>`;
    record.indexLi = li;
    listIndex.appendChild(li);
  });
  Cluster.addLayers(mapMarkers);

  populateGLAMIndexNodes();
  generateFilterSelect();

  processHashChange();
}


// Completely populates the GLAM index with the map markers and
// sorted index list items corresponding to each GLAM type, organization,
// and for all sites as a whole.
function populateGLAMIndexNodes() {

  // Populate index entries with lists of map markers and list items
  Object.values(Records).forEach(record => {
    if (record.mapMarker) GLAMIndex.all.mapMarkers.push(record.mapMarker);
    GLAMIndex.all.indexLis  .push(record.indexLi);
    Object.keys(record.GLAMs).forEach(typeQid => {
      let orgId = GLAM_TYPES[typeQid].org;
      if (record.mapMarker) {
        GLAMIndex[typeQid].mapMarkers.push(record.mapMarker);
        GLAMIndex[orgId  ].mapMarkers.push(record.mapMarker);
      }
      GLAMIndex[typeQid].indexLis.push(record.indexLi);
      GLAMIndex[orgId  ].indexLis.push(record.indexLi);
    });
  });

  // Sort list items (using Schwartzian transform)
  Object.values(GLAMIndex).forEach(indexItem => {
    indexItem.indexLis = indexItem.indexLis
      .map(li => [li, li.textContent])
      .sort((a, b) => a[1] > b[1] ? 1 : -1)
      .map(item => item[0]);
  });
}


// Generates the list index filter select element based on the completed
// GLAM index and sets the element's change event handler.
function generateFilterSelect() {

  let select = document.querySelector('#filter select');

  // Populate the select element (using the specified sort order in GLAM_TYPES)
  select.options[0].textContent += GLAMIndex.all.total;
  let optgroup;
  Object.keys(GLAM_TYPES)
    .filter(qid => !('partOf' in GLAM_TYPES[qid]))
    .map(qid => [qid, GLAM_TYPES[qid].order])  // Schwartzian transform
    .sort((a, b) => a[1] - b[1])
    .map(item => item[0])
    .forEach(qid => {
      let type = GLAM_TYPES[qid];
      if (type.order % 100 === 1) {
        optgroup = document.createElement('optgroup');
        optgroup.label = ORGS[type.org];
        select.appendChild(optgroup);
      }
      let option = document.createElement('option');
      option.value = qid;
      option.textContent = `${type.name} – ${GLAMIndex[qid].total}`;
      optgroup.appendChild(option);
    });

  // Add event handler to activate the filtering
  select.addEventListener('change', function() {
    let qid = select.options[select.selectedIndex].value;
    Cluster.clearLayers();
    Cluster.addLayers(GLAMIndex[qid].mapMarkers);
    Map.fitBounds(Cluster.getBounds());
    let ol = document.getElementById('index-list');
    ol.innerHTML = '';
    GLAMIndex[qid].indexLis.forEach(li => { ol.appendChild(li) });
    select.blur();
  });
}


// Given a heritage site QID, updates the map to show the corresponding
// map marker, opens its popup if it isn't open yet, and displays the heritage
// site's details on the side panel.
function activateSite(qid) {
  displayRecordDetails(qid);
  let record = Records[qid];
  if (record.isCompound) {
    // TODO: Enhance to show all sites
  }
  else if (record.mapMarker) {
    Cluster.zoomToShowLayer(
      record.mapMarker,
      function() {
        Map.setView([record.lat, record.lon], Map.getZoom());
        if (!record.popup.isOpen()) record.mapMarker.openPopup();
      },
    );
  }
}


// Generates the details content of a heritage site for the side panel. Also
// calls queryOsm() for the heritage site.
function generateRecordDetails(qid) {

  let record = Records[qid];

  let titleHtml = `<h1>${record.title}</h1>`;

  let figureHtml = generateFigure(record.imageFilename);

  let articleHtml;

  let englishArticleHtml;
  if (record.articleTitle) {
    articleHtml = '<div class="article main-text loading"><div class="loader"></div></div>';

  }
  else {
    articleHtml = '<div class="article main-text nodata"><p>Instansi GLAM ini belum memiliki artikel Wikipedia bahasa Indonesia.</p></div>';
  }
  englishArticleHtml = '<div class="article main-text loading"></div>';

  function showElem(event) {
    if (record.englishArticleTitle) {
    displayEnglishArticleExtract(record.englishArticleTitle, panelElem.querySelector('.article'));
  }
  else {
    panelElem.querySelector('.article').innerHTML += '<p>Instansi GLAM ini belum memiliki artikel Wikipedia bahasa Inggris.</p>'
  }
    event.target.remove();
  }


  let GLAMsHtml = '<h2>merupakan bagian dari tipe instansi</h2><ul class="GLAMs">';
  Object.keys(record.GLAMs)
  .map(qid => [qid, GLAM_TYPES[qid].order])  // Schwartzian transform
  .sort((a, b) => a[1] - b[1])
  .map(item => item[0])
  .forEach(GLAMQid => {

    let type = GLAM_TYPES[GLAMQid];
    let GLAM = record.GLAMs[GLAMQid];

    let declarationHtml = '';
    if (GLAM.declarationData) {
      declarationHtml =
        `<p>Declaration – <i>${GLAM.declarationTitle}</i>` +
        (GLAM.date ? '; approved ' + GLAM.date : '') +
        '</p>' +
        '<div class="wikilinks">' +
          '<p>' +
            `<a href="${GLAM.declarationData}" title="">` +
              '<img src="img/wikidata_tiny_logo.png" alt="">' +
              '<span>View details in Wikidata</span>' +
            '</a>' +
          '</p>';
      if (GLAM.declarationText) declarationHtml +=
        '<p>' +
          `<a href="${GLAM.declarationText}" title="">` +
            '<img src="img/wikisource_tiny_logo.png" alt="">' +
            '<span>Read declaration text on Wikisource</span>' +
          '</a>' +
        '</p>';
      if (GLAM.declarationScan) declarationHtml +=
        '<p>' +
          `<a href="${GLAM.declarationScan}" title="">` +
            '<img src="img/wikicommons_tiny_logo.png" alt="">' +
            '<span>View scanned declaration in Wikimedia Commons</span>' +
          '</a>' +
        '</p>';
      declarationHtml += '</div>';
    }
    else {
      if (GLAM.date) declarationHtml = `<p>Declared – ${GLAM.date}</p>`;
    }

    GLAMsHtml +=
      '<li>' +
        `<h3>${type.name}</h3>` +
        '<div class="org">' +
          `<img src="img/org_logo_${type.org.toLowerCase()}.svg">` +
          ORGS[type.org] +
        '</div>' +
        declarationHtml +
      '</li>';
  });
  GLAMsHtml += '</ul>';

  let panelElem = document.createElement('div');
  panelElem.innerHTML =
    `<a class="main-wikidata-link" href="https://www.wikidata.org/wiki/${qid}" title="View in Wikidata">` +
    '<img src="img/wikidata_tiny_logo.png" alt="[view Wikidata item]" /></a>' +
    titleHtml +
    figureHtml +
    articleHtml +
    englishArticleHtml +
    `<button class="tombol">Baca juga artikel berbahasa Inggris</button>` +
    GLAMsHtml;
  record.panelElem = panelElem;

  panelElem.querySelector(".tombol").addEventListener('click', showElem);

  // Lazy load Wikipedia article extract
  if (record.articleTitle) displayArticleExtract(record.articleTitle, panelElem.querySelector('.article'));
  //displayArticleExtract(record.articleTitle, panelElem.querySelector('.article'));
  //if (record.englishArticleTitle) displayEnglishArticleExtract(record.englishArticleTitle, panelElem.querySelector('.article'));
  //displayEnglishArticleExtract(record.englishArticleTitle, panelElem.querySelector('.article'));
  
  
  // Lazy load OSM polygon
  queryOsm(qid);
}




// Given an English Wikipedia article title and a div element, retrieves an
// extract of the article via the Wikipedia API and places it into the element.
function displayArticleExtract(title, elem) {
  loadJsonp(
    'https://id.wikipedia.org/w/api.php',
    {
      action    : 'query',
      format    : 'json',
      prop      : 'extracts',
      exintro   : 1,
      redirects : true,
      titles    : title,
    },
    function(data) {
      elem.innerHTML =
        Object.values(data.query.pages)[0].extract.match(/<p[^]+?<\/p>/g).find(text => text.length > 50) +
        '<p class="wikipedia-link">' +
          `<a href="https://id.wikipedia.org/wiki/${encodeURIComponent(title)}">` +
            '<img src="img/wikipedia_tiny_logo.png" alt="" />' +
            '<span>Baca selengkapnya di Wikipedia ID</span>' +
          '</a>' +
        '</p>';
      elem.classList.remove('loading');
    }
  );
}
function displayEnglishArticleExtract(title, elem) {
  loadJsonp(
    'https://en.wikipedia.org/w/api.php',
    {
      action    : 'query',
      format    : 'json',
      prop      : 'extracts',
      exintro   : 1,
      redirects : true,
      titles    : title,
    },
    function(data) {
      elem.innerHTML +=
      '<br>' +
        Object.values(data.query.pages)[0].extract.match(/<p[^]+?<\/p>/g).find(text => text.length > 50) +
        '<p class="wikipedia-link">' +
          `<a href="https://en.wikipedia.org/wiki/${encodeURIComponent(title)}">` +
            '<img src="img/wikipedia_tiny_logo.png" alt="" />' +
            '<span>Baca selengkapnya di Wikipedia EN</span>' +
          '</a>' +
        '</p>';
      elem.classList.remove('loading');
    }
  );
}


// Given a heritage site QID, queries Overpass API to retrieve any OSM ways or
// relations matching the wikidata=QID tag as JSON. If there are, converts the
// JSON into GeoJSON and adds it to the map and sets the "shapeLayer" Records
// field.
function queryOsm(qid) {
  let xhr = new XMLHttpRequest();
  xhr.onreadystatechange = function() {
    if (xhr.readyState !== xhr.DONE) return;
    if (xhr.status === 200) {

      let geoJson = osmtogeojson(JSON.parse(xhr.responseText));
      if (!geoJson || geoJson.features.length === 0) return;
      let shapeLayer = L.geoJSON(
        geoJson,
        {
          style: {
            color   : '#ff3333',
            opacity : 0.7,
            fill    : true,
          },
          filter: feature => feature.geometry.type !== 'Point',
        },
      );
      Records[qid].shapeLayer = shapeLayer;
      shapeLayer.addTo(Map);

      if (window.location.hash.replace('#', '') === qid) {
        Map.fitBounds(shapeLayer.getBounds());
      }
    }
    else {
      console.log('ERROR loading from Overpass API', xhr);
    }
  };
  xhr.open(
    'GET',
    'https://overpass-api.de/api/interpreter?data=' +
    encodeURIComponent(
`[out:json][timeout:25];
(
  way     ["wikidata"="${qid}"];
  relation["wikidata"="${qid}"];
);
out body;
>;
out skel qt;`
    ),
    true,
  );
  xhr.send();
}


// ============================================================
// CLASSES
// ------------------------------------------------------------

// Class declaration for representing a site's heritage GLAM
class GLAM {
  constructor() {
    this.date             = undefined;
    this.declarationData  = undefined;
    this.declarationTitle = undefined;
    this.declarationScan  = undefined;
    this.declarationText  = undefined;
    this.partOfQid        = null;
    // TODO: Add links to external info about the GLAM
    // such as the official WHS page
  }
}


// Class declaration representing an entry in the GLAM index and used to
// enable the filtering by GLAM types in the index list
class GLAMIndexEntry {
  constructor() {
    this.total      = 0;
    this.mapMarkers = [];
    this.indexLis   = [];
  }
}


// Class declaration for representing a heritage site
class Record {
  constructor(isCompound) {
    this.isCompound    = isCompound;
    this.title         = undefined;
    this.imageFilename = '';
    this.articleTitle  = undefined;
    this.englishArticleTitle = undefined;
    this.GLAMs  = {};
    this.panelElem     = undefined;
    this.indexLi       = undefined;
  }
}


// Subclass declaration for representing an individual heritage site
// (mainly with location data such as coordinates)
class SimpleRecord extends Record {
  constructor() {
    super(false);
    this.lat        = undefined;
    this.lon        = undefined;
    this.mapMarker  = undefined;
    this.popup      = undefined;
    this.shapeLayer = undefined;
  }
}


// Subclass declaration for representing a compound heritage site
// (mainly a set of simple sites, so does not have any location in itself)
class CompoundRecord extends Record {
  constructor() {
    super(true);
    this.parts = [];  // TODO: This should be properly populated
  }
}