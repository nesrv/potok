from django.contrib import admin

from apps.storefronts.models import Product, ProductPhoto, Storefront

admin.site.register(Storefront)
admin.site.register(Product)
admin.site.register(ProductPhoto)
