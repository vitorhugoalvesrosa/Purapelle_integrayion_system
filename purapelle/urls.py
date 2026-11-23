from django.contrib import admin
from django.contrib.auth import views as auth_views
from django.urls import include, path, reverse_lazy

urlpatterns = [
    path("admin/", admin.site.urls),
    path("login/", auth_views.LoginView.as_view(template_name="clinic/login.html"), name="login"),
    path("logout/", auth_views.LogoutView.as_view(), name="logout"),
    path(
        "accounts/password-change/",
        auth_views.PasswordChangeView.as_view(
            template_name="clinic/password_change.html",
            success_url=reverse_lazy("dashboard"),
        ),
        name="password-change",
    ),
    path("", include("clinic.urls")),
]
