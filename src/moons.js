(function(global){'use strict';
// JPL SSD physical parameters and mean elements, retrieved 2026-11-14.
// Elements describe approximate orbit shapes, not present-day ephemerides.
// Each system uses its source local reference plane. No global pole/precession model.
const moons=[
  {
    "name": "Moon",
    "parent": 2,
    "radiusKm": 1737.4,
    "aKm": 384400,
    "e": 0.0554,
    "periDeg": 318.15,
    "meanDeg": 135.27,
    "inclinationDeg": 5.16,
    "nodeDeg": 125.08,
    "periodDays": 27.322
  },
  {
    "name": "Phobos",
    "parent": 3,
    "radiusKm": 11.08,
    "aKm": 9375,
    "e": 0.015,
    "periDeg": 216.3,
    "meanDeg": 189.7,
    "inclinationDeg": 1.1,
    "nodeDeg": 169.2,
    "periodDays": 0.3187
  },
  {
    "name": "Deimos",
    "parent": 3,
    "radiusKm": 6.2,
    "aKm": 23457,
    "e": 0,
    "periDeg": 0,
    "meanDeg": 205,
    "inclinationDeg": 1.8,
    "nodeDeg": 54.3,
    "periodDays": 1.2625
  },
  {
    "name": "Io",
    "parent": 4,
    "radiusKm": 1821.49,
    "aKm": 421800,
    "e": 0.004,
    "periDeg": 49.1,
    "meanDeg": 330.9,
    "inclinationDeg": 0,
    "nodeDeg": 0,
    "periodDays": 1.762732
  },
  {
    "name": "Europa",
    "parent": 4,
    "radiusKm": 1560.8,
    "aKm": 671100,
    "e": 0.009,
    "periDeg": 45,
    "meanDeg": 345.4,
    "inclinationDeg": 0.5,
    "nodeDeg": 184,
    "periodDays": 3.525463
  },
  {
    "name": "Ganymede",
    "parent": 4,
    "radiusKm": 2631.2,
    "aKm": 1070400,
    "e": 0.001,
    "periDeg": 198.3,
    "meanDeg": 324.8,
    "inclinationDeg": 0.2,
    "nodeDeg": 58.5,
    "periodDays": 7.155588
  },
  {
    "name": "Callisto",
    "parent": 4,
    "radiusKm": 2410.3,
    "aKm": 1882700,
    "e": 0.007,
    "periDeg": 43.8,
    "meanDeg": 87.4,
    "inclinationDeg": 0.3,
    "nodeDeg": 309.1,
    "periodDays": 16.69044
  },
  {
    "name": "Mimas",
    "parent": 5,
    "radiusKm": 198.2,
    "aKm": 186000,
    "e": 0.02,
    "periDeg": 160.4,
    "meanDeg": 275.3,
    "inclinationDeg": 1.6,
    "nodeDeg": 66.2,
    "periodDays": 0.942422
  },
  {
    "name": "Enceladus",
    "parent": 5,
    "radiusKm": 252.1,
    "aKm": 238400,
    "e": 0.005,
    "periDeg": 119.5,
    "meanDeg": 57,
    "inclinationDeg": 0,
    "nodeDeg": 0,
    "periodDays": 1.370218
  },
  {
    "name": "Tethys",
    "parent": 5,
    "radiusKm": 531.1,
    "aKm": 295000,
    "e": 0.001,
    "periDeg": 335.3,
    "meanDeg": 0,
    "inclinationDeg": 1.1,
    "nodeDeg": 273,
    "periodDays": 1.887802
  },
  {
    "name": "Dione",
    "parent": 5,
    "radiusKm": 561.4,
    "aKm": 377700,
    "e": 0.002,
    "periDeg": 116,
    "meanDeg": 212,
    "inclinationDeg": 0,
    "nodeDeg": 0,
    "periodDays": 2.736916
  },
  {
    "name": "Rhea",
    "parent": 5,
    "radiusKm": 763.5,
    "aKm": 527200,
    "e": 0.001,
    "periDeg": 44.3,
    "meanDeg": 31.5,
    "inclinationDeg": 0.3,
    "nodeDeg": 133.7,
    "periodDays": 4.517503
  },
  {
    "name": "Titan",
    "parent": 5,
    "radiusKm": 2574.76,
    "aKm": 1221900,
    "e": 0.029,
    "periDeg": 78.3,
    "meanDeg": 11.7,
    "inclinationDeg": 0.3,
    "nodeDeg": 78.6,
    "periodDays": 15.945448
  },
  {
    "name": "Iapetus",
    "parent": 5,
    "radiusKm": 734.3,
    "aKm": 3561700,
    "e": 0.028,
    "periDeg": 254.5,
    "meanDeg": 74.8,
    "inclinationDeg": 7.6,
    "nodeDeg": 86.5,
    "periodDays": 79.331002
  },
  {
    "name": "Miranda",
    "parent": 6,
    "radiusKm": 235.8,
    "aKm": 129846,
    "e": 0.001,
    "periDeg": 154.8,
    "meanDeg": 73,
    "inclinationDeg": 4.4,
    "nodeDeg": 100.9,
    "periodDays": 1.413479
  },
  {
    "name": "Ariel",
    "parent": 6,
    "radiusKm": 578.9,
    "aKm": 190929,
    "e": 0.001,
    "periDeg": 9.6,
    "meanDeg": 193.5,
    "inclinationDeg": 0,
    "nodeDeg": 0,
    "periodDays": 2.520379
  },
  {
    "name": "Umbriel",
    "parent": 6,
    "radiusKm": 584.7,
    "aKm": 265986,
    "e": 0.004,
    "periDeg": 183.4,
    "meanDeg": 253,
    "inclinationDeg": 0.1,
    "nodeDeg": 174.8,
    "periodDays": 4.144177
  },
  {
    "name": "Titania",
    "parent": 6,
    "radiusKm": 788.9,
    "aKm": 436298,
    "e": 0.002,
    "periDeg": 184,
    "meanDeg": 68.1,
    "inclinationDeg": 0.1,
    "nodeDeg": 29.5,
    "periodDays": 8.705869
  },
  {
    "name": "Oberon",
    "parent": 6,
    "radiusKm": 761.4,
    "aKm": 583511,
    "e": 0.002,
    "periDeg": 132.2,
    "meanDeg": 143.6,
    "inclinationDeg": 0.1,
    "nodeDeg": 76.8,
    "periodDays": 13.463237
  },
  {
    "name": "Triton",
    "parent": 7,
    "radiusKm": 1352.6,
    "aKm": 354800,
    "e": 0,
    "periDeg": 0,
    "meanDeg": 63,
    "inclinationDeg": 157.3,
    "nodeDeg": 177.7,
    "periodDays": 5.8792
  },
  {
    "name": "Proteus",
    "parent": 7,
    "radiusKm": 208,
    "aKm": 117700,
    "e": 0.001,
    "periDeg": 357.2,
    "meanDeg": 297.4,
    "inclinationDeg": 0.6,
    "nodeDeg": 355.5,
    "periodDays": 1.1229
  }
];
const planetRadiiKm=[2439.4,6051.8,6371.0084,3389.5,69911,58232,25362,24622];
function position(m,days){const rad=Math.PI/180;const M=(m.meanDeg*rad+days*2*Math.PI/m.periodDays)%(2*Math.PI);let E=M;for(let i=0;i<12;i++)E-=(E-m.e*Math.sin(E)-M)/(1-m.e*Math.cos(E));const x=m.aKm*(Math.cos(E)-m.e),z=m.aKm*Math.sqrt(1-m.e*m.e)*Math.sin(E);const w=m.periDeg*rad,n=m.nodeDeg*rad,inc=m.inclinationDeg*rad;const u=x*Math.cos(w)-z*Math.sin(w),v=x*Math.sin(w)+z*Math.cos(w);return [u*Math.cos(n)-v*Math.cos(inc)*Math.sin(n),v*Math.sin(inc),u*Math.sin(n)+v*Math.cos(inc)*Math.cos(n)];}
global.SolarMoons={moons,planetRadiiKm,position};
})(window);
