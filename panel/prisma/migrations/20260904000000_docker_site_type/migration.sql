-- DOCKER site turu icin SiteType enum'ina yeni deger eklenir (v1.2.1).
-- Not: ADD VALUE ayni migration icinde baska bir seyle birlikte
-- kullanilamaz, bu yuzden bu migration sadece enum degerini ekler.

ALTER TYPE "SiteType" ADD VALUE 'DOCKER';
