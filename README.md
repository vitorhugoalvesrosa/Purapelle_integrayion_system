# Purapelle_integration_system

## Acesso e perfis

O painel requer autenticação. Os perfis disponíveis são:

- `administrador`: acesso completo e gerenciamento de usuários em `/admin/`.
- `gerente`: gerenciamento de pacientes e dados clínicos.
- `operador`: consulta de pacientes e registro de procedimentos/fotografias.

Para configurar uma instalação nova, aplique as migrações e crie as três contas:

```sh
python manage.py migrate
python manage.py setup_clinic_users
```

O segundo comando solicita as senhas sem exibi-las no terminal. Use nele as senhas iniciais combinadas e troque-as após o primeiro acesso pelo link **Alterar senha**. O comando não redefine a senha de uma conta que já exista.

Em produção, defina `DJANGO_DEBUG=0`, `DJANGO_SECRET_KEY` com um segredo forte e `DJANGO_ALLOWED_HOSTS` com os domínios permitidos. Configure também armazenamento persistente para o banco SQLite padrão; sem isso, as contas e os dados clínicos podem ser perdidos ao reiniciar ou redeployar a aplicação. Execute os dois comandos de configuração no ambiente que realmente atende a aplicação.