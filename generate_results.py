import pandas as pd
import numpy as np
import json
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import accuracy_score, precision_score, recall_score, f1_score, confusion_matrix
from sklearn.neighbors import KNeighborsClassifier
from sklearn.svm import SVC
from sklearn.tree import DecisionTreeClassifier
from sklearn.ensemble import RandomForestClassifier
from sklearn.inspection import permutation_importance
from xgboost import XGBClassifier
from imblearn.over_sampling import SMOTE
import warnings
warnings.filterwarnings('ignore')

def main():
    # 1. Load data
    df_raw = pd.read_excel('data/morfometric_citarum.xlsx')
    
    # 2. Clean data (fill NA/Inf with median)
    df_clean = df_raw.copy()
    for col in df_clean.select_dtypes(include=[np.number]).columns:
        if col != 'fid':
            df_clean[col].replace([np.inf, -np.inf], np.nan, inplace=True)
            med_val = df_clean[col].median()
            df_clean[col].fillna(med_val, inplace=True)
            
    # 3. Define params
    param_direct = ["Dd", "Fs", "Dt", "Rn", "Rbm", "Rlm", "Rho", "Bh", "Rhp_true", "Di", "If"]
    param_inverse = ["Ff", "Sb", "K", "Rc", "Re", "Cc", "Ccm", "Lo"]
    param_all_19 = param_direct + param_inverse
    
    # 4. Rank and Calculate Cp
    df_ranked = df_clean.copy()
    for col in param_direct:
        df_ranked[f'rank_{col}'] = df_ranked[col].rank(method='average', ascending=False)
    for col in param_inverse:
        df_ranked[f'rank_{col}'] = df_ranked[col].rank(method='average', ascending=True)
        
    rank_cols = [f'rank_{col}' for col in param_all_19]
    df_ranked['Cp'] = df_ranked[rank_cols].mean(axis=1)
    
    # 5. Classify (Tertile)
    cp_tertile_33 = df_ranked['Cp'].quantile(1/3)
    cp_tertile_66 = df_ranked['Cp'].quantile(2/3)
    
    def get_class(cp):
        if cp <= cp_tertile_33: return "Tinggi"
        elif cp <= cp_tertile_66: return "Sedang"
        else: return "Rendah"
        
    df_ranked['Kelas_Erosi'] = df_ranked['Cp'].apply(get_class)
    
    # Map for SMOTE and models (need numeric labels for XGBoost)
    class_map = {"Tinggi": 0, "Sedang": 1, "Rendah": 2}
    inv_class_map = {0: "Tinggi", 1: "Sedang", 2: "Rendah"}
    
    X = df_ranked[param_all_19]
    y = df_ranked['Kelas_Erosi'].map(class_map)
    
    # Split
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, stratify=y, random_state=123)
    
    # SMOTE
    smote = SMOTE(random_state=123)
    X_train_sm, y_train_sm = smote.fit_resample(X_train, y_train)
    
    # Scale (only on numeric predictors, which all are)
    scaler = StandardScaler()
    X_train_sm_scaled = scaler.fit_transform(X_train_sm)
    X_test_scaled = scaler.transform(X_test)
    X_scaled = scaler.transform(X) # for predicting all
    
    # Models
    models = {
        "KNN": KNeighborsClassifier(n_neighbors=5),
        "SVM (Polynomial)": SVC(kernel='poly', degree=2, C=1, random_state=123),
        "Decision Tree": DecisionTreeClassifier(ccp_alpha=0.01, max_depth=10, min_samples_split=5, random_state=123),
        "Random Forest": RandomForestClassifier(n_estimators=500, min_samples_split=5, random_state=123),
        "XGBoost": XGBClassifier(n_estimators=500, max_depth=6, learning_rate=0.05, random_state=123)
    }
    
    results = {
        "metrics": {},
        "feature_importance": {},
        "predictions": {
            "SubDAS_ID": df_clean['fid'].tolist(), # Use 'fid' as SubDAS_ID since it matches
            "Cp": df_ranked['Cp'].tolist(),
            "Actual_Class": df_ranked['Kelas_Erosi'].tolist()
        }
    }
    
    for name, model in models.items():
        # Train
        model.fit(X_train_sm_scaled, y_train_sm)
        
        # Eval on Test
        y_pred = model.predict(X_test_scaled)
        
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, average='macro')
        rec = recall_score(y_test, y_pred, average='macro')
        f1 = f1_score(y_test, y_pred, average='macro')
        
        results["metrics"][name] = {
            "Accuracy": float(round(acc, 4)),
            "Precision": float(round(prec, 4)),
            "Recall": float(round(rec, 4)),
            "F1-Score": float(round(f1, 4))
        }
        
        # Predict all
        y_all_pred = model.predict(X_scaled)
        results["predictions"][name] = [inv_class_map[val] for val in y_all_pred]
        
        # Feature Importance
        if hasattr(model, 'feature_importances_'):
            imps = model.feature_importances_
        else:
            perm_imp = permutation_importance(model, X_train_sm_scaled, y_train_sm, n_repeats=10, random_state=123)
            imps = perm_imp.importances_mean
            
        # Top 5
        imp_df = pd.DataFrame({'Variable': param_all_19, 'Importance': imps})
        imp_df = imp_df.sort_values(by='Importance', ascending=False).head(5)
        
        # ensure float type for json
        imp_df['Importance'] = imp_df['Importance'].astype(float)
        results["feature_importance"][name] = imp_df.to_dict(orient='records')

    # Add general summary
    results["overview"] = {
        "Total_SubDAS": len(df_clean),
        "Param_Direct": len(param_direct),
        "Param_Inverse": len(param_inverse)
    }
        
    print(json.dumps(results, indent=4))

if __name__ == "__main__":
    main()
