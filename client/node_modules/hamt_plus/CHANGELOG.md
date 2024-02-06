# ChangeLog #

## 1.0.2 - March 27, 2017
* Fixed mutation splice out. Thanks @wshager!

## 1.0.1 - January 27, 2016
* Fixed bug when array nodes are packed during removal.

## 1.0.0 - January 26, 2016
* Refork from Hamt 2.1
  * Duplicates existing Hamt 2.x API.
* Added constant time size queries.

## 0.0.6 - September 27, 2014
* Fixed collision nodes on unexpanded branch not being expanded on insertions
  further down branch. Thanks raymond-w-ko for reporting this and providing test
  data for `hamt`.

## 0.0.5 - Aug 22, 2014
* Fixed `CollisionNode` updates not using node values.

## 0.0.4 - Aug 21, 2014
* Fixed `CollisionNode` not having an `edit` member.

## 0.0.3 - Aug 19, 2014
* Revert `fold` to fix performance degradation.

## 0.0.0 - Aug 18, 2014
* Initial release.
