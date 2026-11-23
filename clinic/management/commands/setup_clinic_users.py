from getpass import getpass

from django.contrib.auth import get_user_model
from django.contrib.auth.models import Group
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction


class Command(BaseCommand):
    help = "Cria os perfis administrador, gerente e operador."

    @transaction.atomic
    def handle(self, *args, **options):
        user_model = get_user_model()
        profiles = (
            ("administrador", "administrador"),
            ("gerente", "gerente"),
            ("operador", "operador"),
        )
        for username, group_name in profiles:
            group, _ = Group.objects.get_or_create(name=group_name)
            user, created = user_model.objects.get_or_create(username=username)
            if created:
                password = self._read_password(username)
                user.set_password(password)
            user.groups.set([group])
            if username == "administrador":
                user.is_staff = True
                user.is_superuser = True
            user.save()
            state = "criada" if created else "atualizada; senha mantida"
            self.stdout.write(f"Conta {username} {state}.")
        self.stdout.write(self.style.SUCCESS("Perfis prontos. Troque as senhas iniciais após o primeiro acesso."))

    @staticmethod
    def _read_password(username):
        while True:
            password = getpass(f"Senha inicial para {username}: ")
            if len(password) < 8:
                raise CommandError("A senha precisa ter pelo menos 8 caracteres.")
            if password == getpass("Confirme a senha: "):
                return password
            raise CommandError("As senhas não conferem; execute o comando novamente.")
