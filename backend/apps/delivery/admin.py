from django.contrib import admin

from apps.delivery.models import District, DistrictNotice, ProductDistrict

admin.site.register(District)
admin.site.register(ProductDistrict)
admin.site.register(DistrictNotice)
