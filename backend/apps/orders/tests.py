import json
from datetime import timedelta
from decimal import Decimal

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone

from apps.delivery.models import DistrictNotice
from apps.orders.models import GroupOrder


PNG = (
    b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
    b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\nIDATx\x9cc\x00\x01"
    b"\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
)


class OrderRulesTests(TestCase):
    def post(self, path, payload, token=None):
        headers = {}
        if token:
            headers["HTTP_AUTHORIZATION"] = f"Bearer {token}"
        response = self.client.post(
            path,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )
        return response

    def auth(self, login):
        response = self.post("/api/auth/register", {"email": login, "password": "password1"})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["token"]

    def setup_product(self, token, minimum="10"):
        storefront = self.post("/api/storefronts", {"name": "Хозяйство"}, token)
        self.assertEqual(storefront.status_code, 200, storefront.content)
        product = self.post(
            "/api/products",
            {
                "storefront_id": storefront.json()["id"],
                "description": "Молоко",
                "unit": "л",
                "minimum": minimum,
                "topup_hours": 2,
            },
            token,
        )
        self.assertEqual(product.status_code, 200, product.content)
        product_id = product.json()["id"]
        photo = SimpleUploadedFile("milk.png", PNG, content_type="image/png")
        uploaded = self.client.post(
            f"/api/products/{product_id}/photos",
            {"file": photo},
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(uploaded.status_code, 200, uploaded.content)
        districts = self.client.put(
            f"/api/products/{product_id}/districts",
            data=json.dumps({"names": ["Анапа"]}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {token}",
        )
        self.assertEqual(districts.status_code, 200, districts.content)
        return product_id, districts.json()[0]["id"]

    def test_minimum_by_line_blocks_cancel_and_notifies(self):
        seller = self.auth("farm@example.com")
        buyer = self.auth("buyer@example.com")
        product_id, district_id = self.setup_product(seller, "5")
        created = self.post(
            f"/api/products/{product_id}/lines",
            {"quantity": "5", "district_id": district_id, "address": "ул. Мира, 1"},
            buyer,
        )
        self.assertEqual(created.status_code, 200, created.content)
        body = created.json()
        self.assertEqual(body["status"], "topup")
        self.assertEqual(body["buyers"], 1)
        self.assertTrue(body["cancel_blocked"])
        self.assertEqual(DistrictNotice.objects.count(), 1)
        line_id = GroupOrder.objects.get(pk=body["order_id"]).lines.get().pk
        cancelled = self.client.delete(
            f"/api/lines/{line_id}",
            HTTP_AUTHORIZATION=f"Bearer {buyer}",
        )
        self.assertEqual(cancelled.status_code, 409)

    def test_lowering_minimum_promotes(self):
        seller = self.auth("farm2@example.com")
        buyer = self.auth("buyer2@example.com")
        product_id, district_id = self.setup_product(seller, "10")
        created = self.post(
            f"/api/products/{product_id}/lines",
            {"quantity": "4", "district_id": district_id, "address": "дом 2"},
            buyer,
        )
        self.assertEqual(created.json()["status"], "collecting")
        patched = self.client.patch(
            f"/api/products/{product_id}",
            data=json.dumps({"minimum": "4"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {seller}",
        )
        self.assertEqual(patched.status_code, 200, patched.content)
        card = self.client.get(f"/api/products/{product_id}", HTTP_AUTHORIZATION=f"Bearer {buyer}")
        self.assertEqual(card.json()["progress"]["status"], "topup")
        self.assertEqual(card.json()["progress"]["minimum"], "4.000")

    def test_expired_window_closes_without_new_order(self):
        seller = self.auth("farm3@example.com")
        buyer = self.auth("buyer3@example.com")
        product_id, district_id = self.setup_product(seller, "1")
        created = self.post(
            f"/api/products/{product_id}/lines",
            {"quantity": "1", "district_id": district_id, "address": "дом 3"},
            buyer,
        )
        order = GroupOrder.objects.get(pk=created.json()["order_id"])
        order.topup_ends_at = timezone.now() - timedelta(minutes=1)
        order.save(update_fields=["topup_ends_at"])
        card = self.client.get(f"/api/products/{product_id}", HTTP_AUTHORIZATION=f"Bearer {buyer}")
        self.assertIsNone(card.json()["progress"]["status"])
        self.assertEqual(GroupOrder.objects.filter(product_id=product_id, status=GroupOrder.CLOSED).count(), 1)
        self.assertFalse(GroupOrder.objects.filter(product_id=product_id, status=GroupOrder.COLLECTING).exists())

    def test_repeat_line_does_not_increase_buyers(self):
        seller = self.auth("farm4@example.com")
        buyer = self.auth("buyer4@example.com")
        product_id, district_id = self.setup_product(seller, "10")
        first = self.post(
            f"/api/products/{product_id}/lines",
            {"quantity": "1", "district_id": district_id, "address": "дом 4"},
            buyer,
        )
        second = self.post(
            f"/api/products/{product_id}/lines",
            {"quantity": "2", "district_id": district_id, "address": "дом 4"},
            buyer,
        )
        self.assertEqual(first.json()["buyers"], 1)
        self.assertEqual(second.json()["buyers"], 1)
        self.assertEqual(Decimal(second.json()["quantity"]), Decimal("3"))

    def test_line_without_photo_is_rejected(self):
        seller = self.auth("farm5@example.com")
        buyer = self.auth("buyer5@example.com")
        storefront = self.post("/api/storefronts", {"name": "Сад"}, seller)
        product = self.post(
            "/api/products",
            {
                "storefront_id": storefront.json()["id"],
                "description": "Яблоки",
                "unit": "кг",
                "minimum": "1",
                "topup_hours": 1,
            },
            seller,
        )
        product_id = product.json()["id"]
        districts = self.client.put(
            f"/api/products/{product_id}/districts",
            data=json.dumps({"names": ["Сукко"]}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {seller}",
        )
        created = self.post(
            f"/api/products/{product_id}/lines",
            {"quantity": "1", "district_id": districts.json()[0]["id"], "address": "дом 5"},
            buyer,
        )
        self.assertEqual(created.status_code, 400)
        self.assertFalse(GroupOrder.objects.filter(product_id=product_id).exists())

    def login(self, email):
        response = self.post("/api/auth/token", {"login": email, "password": "password1"})
        self.assertEqual(response.status_code, 200, response.content)
        return response.json()["token"]

    def test_two_farmers_from_register_until_batch_closes(self):
        first = self.auth("farmer-one@example.com")
        first = self.login("farmer-one@example.com")
        second = self.auth("farmer-two@example.com")
        second = self.login("farmer-two@example.com")

        milk_id, milk_district = self.setup_product(first, "4")
        eggs_id, eggs_district = self.setup_product(second, "6")
        self.assertNotEqual(milk_id, eggs_id)
        self.assertNotEqual(milk_district, eggs_district)

        own = self.post(
            f"/api/products/{eggs_id}/lines",
            {"quantity": "2", "district_id": eggs_district, "address": "ул. Садовая, 2"},
            second,
        )
        self.assertEqual(own.status_code, 200, own.content)
        self.assertEqual(own.json()["status"], "collecting")

        joined = self.post(
            f"/api/products/{milk_id}/lines",
            {"quantity": "4", "district_id": milk_district, "address": "ул. Лесная, 8"},
            second,
        )
        self.assertEqual(joined.status_code, 200, joined.content)
        self.assertEqual(joined.json()["status"], "topup")
        self.assertTrue(joined.json()["cancel_blocked"])
        order_id = joined.json()["order_id"]

        order = GroupOrder.objects.get(pk=order_id)
        order.topup_ends_at = timezone.now() - timedelta(minutes=1)
        order.save(update_fields=["topup_ends_at"])

        card = self.client.get(f"/api/products/{milk_id}")
        self.assertIsNone(card.json()["progress"]["status"])
        detail = self.client.get(
            f"/api/orders/{order_id}",
            HTTP_AUTHORIZATION=f"Bearer {second}",
        )
        self.assertEqual(detail.status_code, 200, detail.content)
        body = detail.json()
        self.assertEqual(body["status"], "closed")
        self.assertEqual(body["lines"][0]["address"], "ул. Лесная, 8")
        self.assertEqual(Decimal(body["quantity"]), Decimal("4"))
        self.assertEqual(DistrictNotice.objects.filter(order_id=order_id).count(), 1)
