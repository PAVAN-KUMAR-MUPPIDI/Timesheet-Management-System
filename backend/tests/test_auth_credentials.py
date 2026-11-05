import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_manager_login_credentials():
    response = client.post('/api/auth/login', json={
        'email': 'mohan@company.com',
        'password': 'mohan@1234'
    })
    assert response.status_code == 200
    data = response.json()
    assert data['role'] == 'manager'
    assert data['email'] == 'mohan@company.com'
    assert 'access_token' in data

def test_employee_chandrika_login_credentials():
    response = client.post('/api/auth/login', json={
        'email': 'chandrika.t@company.com',
        'password': 'chandrika@1234'
    })
    assert response.status_code == 200
    data = response.json()
    assert data['role'] == 'employee'
    assert data['employee_id'] == 'E01'
    assert 'access_token' in data

@pytest.mark.parametrize("email,password,expected_id", [
    ('vishnuvardhan.k@company.com', 'vishnuvardhan@1234', 'E02'),
    ('praveen.u@company.com', 'praveen@1234', 'E03'),
    ('raghu.d@company.com', 'raghu@1234', 'E04'),
    ('sushmitha.k@company.com', 'sushmitha@1234', 'E05'),
    ('harsha.s@company.com', 'harsha@1234', 'E06'),
    ('moses.d@company.com', 'moses@1234', 'E07'),
    ('pavan.m@company.com', 'pavan@1234', 'E08'),
    ('divya.s@company.com', 'divya@1234', 'E09'),
])
def test_all_employee_logins(email, password, expected_id):
    response = client.post('/api/auth/login', json={
        'email': email,
        'password': password
    })
    assert response.status_code == 200
    data = response.json()
    assert data['role'] == 'employee'
    assert data['employee_id'] == expected_id

def test_invalid_password_rejected():
    response = client.post('/api/auth/login', json={
        'email': 'mohan@company.com',
        'password': 'incorrect_password!123'
    })
    assert response.status_code == 401

